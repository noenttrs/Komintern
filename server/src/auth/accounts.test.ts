import assert from "node:assert/strict";
import test from "node:test";

import { MemoryMailer } from "./mailer";
import { AccountService, ApiError } from "./accounts";
import { EmailCodeService } from "./codes";
import { SessionService } from "./sessions";
import { memoryStores } from "../services";
import type { MemoryGameLogStore } from "../store/gamelog";

function setup() {
  const mailer = new MemoryMailer();
  const stores = memoryStores(mailer);
  const sessions = new SessionService(stores.kv);
  const codes = new EmailCodeService(stores.kv);
  return { accounts: new AccountService({ ...stores, sessions, codes }), mailer, stores, sessions };
}

const code = (error: unknown) => (error instanceof ApiError ? error.code : String(error));

async function registered(email = "rosa@example.org", displayName = "Rosa") {
  const ctx = setup();
  const token = await ctx.accounts.register({ email, password: "correct horse battery", displayName }, "1.1.1.1");
  const user = await ctx.accounts.verifyEmail(email, ctx.mailer.lastCodeFor(email.toLowerCase()), token);
  return { ...ctx, user };
}

test("register sends a code, verify activates the account, login works", async () => {
  const { accounts, user } = await registered("Rosa@Example.org");
  assert.equal(user.email, "rosa@example.org");
  assert.equal(user.emailVerified, true);
  assert.notEqual(user.passwordHash, "correct horse battery");
  const logged = await accounts.login({ email: "rosa@example.org", password: "correct horse battery" }, "1.1.1.1");
  assert.equal(logged.id, user.id);
});

test("input validation and uniqueness", async () => {
  const { accounts } = await registered();
  await assert.rejects(accounts.register({ email: "nope", password: "correct horse battery", displayName: "Karl" }, "2.2.2.2"), (e) => code(e) === "invalid_email");
  await assert.rejects(accounts.register({ email: "k@example.org", password: "short", displayName: "Karl" }, "2.2.2.2"), (e) => code(e) === "weak_password");
  await assert.rejects(accounts.register({ email: "rosa@example.org", password: "correct horse battery", displayName: "Karl" }, "2.2.2.2"), (e) => code(e) === "email_taken");
  await assert.rejects(accounts.register({ email: "k@example.org", password: "correct horse battery", displayName: "rosa" }, "2.2.2.2"), (e) => code(e) === "display_name_taken");
});

test("an unconfirmed registration is not an account yet", async () => {
  const { accounts, stores } = setup();
  await accounts.register({ email: "karl@example.org", password: "correct horse battery", displayName: "Karl" }, "1.1.1.1");
  assert.equal(await stores.users.findByEmail("karl@example.org"), null);
  await assert.rejects(accounts.login({ email: "karl@example.org", password: "correct horse battery" }, "1.1.1.1"), (e) => code(e) === "invalid_credentials");
  await assert.rejects(accounts.login({ email: "ghost@example.org", password: "whatever12345" }, "1.1.1.1"), (e) => code(e) === "invalid_credentials");
});

test("someone who knows the email cannot swap in their own password during a registration", async () => {
  const { accounts, mailer, stores } = setup();
  const victimToken = await accounts.register({ email: "rosa@example.org", password: "victim password!", displayName: "Rosa" }, "1.1.1.1");
  const victimCode = mailer.lastCodeFor("rosa@example.org");
  // L'attaquant ne peut pas redemander de code pendant la minute de délai...
  await assert.rejects(accounts.register({ email: "rosa@example.org", password: "attacker password", displayName: "Evil" }, "6.6.6.6"), (e) => code(e) === "code_cooldown");
  // ... et même après, son inscription reste liée à son propre jeton.
  await stores.kv.del("codecool:verify:rosa@example.org");
  const attackerToken = await accounts.register({ email: "rosa@example.org", password: "attacker password", displayName: "Evil" }, "6.6.6.6");
  const latestCode = mailer.lastCodeFor("rosa@example.org");
  assert.notEqual(latestCode, victimCode);
  await assert.rejects(accounts.verifyEmail("rosa@example.org", victimCode, victimToken), (e) => code(e) === "invalid_code", "the old code was replaced");
  // La victime tape le dernier code reçu, avec son navigateur : ce sont ses identifiants qui comptent.
  const user = await accounts.verifyEmail("rosa@example.org", latestCode, victimToken);
  assert.equal(user.displayName, "Rosa");
  await accounts.login({ email: "rosa@example.org", password: "victim password!" }, "1.1.1.1");
  await assert.rejects(accounts.login({ email: "rosa@example.org", password: "attacker password" }, "6.6.6.6"), (e) => code(e) === "invalid_credentials");
  void attackerToken;
});

test("code guesses are counted atomically and capped per day, even across new codes", async () => {
  const { accounts, stores, mailer } = setup();
  const token = await accounts.register({ email: "karl@example.org", password: "correct horse battery", displayName: "Karl" }, "1.1.1.1");
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => accounts.verifyEmail("karl@example.org", "000000", token)));
  const invalid = results.filter((result) => result.status === "rejected" && code(result.reason) === "invalid_code").length;
  assert.ok(invalid <= 5, `at most 5 guesses per code, got ${invalid}`);
  for (let round = 0; round < 5; round += 1) {
    await stores.kv.del("codecool:verify:karl@example.org");
    await accounts.resendVerification("karl@example.org").catch(() => undefined);
    await accounts.register({ email: "karl@example.org", password: "correct horse battery", displayName: "Karl" }, "1.1.1.1").catch(() => undefined);
    for (let guess = 0; guess < 5; guess += 1) await accounts.verifyEmail("karl@example.org", "000000", token).catch(() => undefined);
  }
  await assert.rejects(accounts.verifyEmail("karl@example.org", mailer.lastCodeFor("karl@example.org"), token), (e) => code(e) === "code_too_many_attempts" || code(e) === "code_expired", "the daily budget is spent");
});

test("codes expire after too many wrong attempts", async () => {
  const { accounts } = setup();
  await accounts.register({ email: "karl@example.org", password: "correct horse battery", displayName: "Karl" }, "1.1.1.1");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(accounts.verifyEmail("karl@example.org", "000000"), (e) => code(e) === "invalid_code" || code(e) === "code_too_many_attempts");
  }
  await assert.rejects(accounts.verifyEmail("karl@example.org", "000000"), (e) => code(e) === "code_too_many_attempts");
});

test("password reset changes the password and signs out everywhere", async () => {
  const { accounts, mailer, sessions, user, stores } = await registered();
  const sessionId = await sessions.create(user.id);
  await stores.kv.del("codecool:reset:rosa@example.org");
  await accounts.requestPasswordReset("rosa@example.org");
  await accounts.requestPasswordReset("ghost@example.org");
  // L'envoi part en arrière-plan (temps de réponse identique avec ou sans compte).
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(mailer.sent.filter((mail) => mail.to === "ghost@example.org").length, 0);
  await accounts.resetPassword({ email: "rosa@example.org", code: mailer.lastCodeFor("rosa@example.org"), password: "a brand new password" });
  assert.equal(await sessions.resolve(sessionId), null);
  await accounts.login({ email: "rosa@example.org", password: "a brand new password" }, "1.1.1.1");
});

test("google login links a verified account, takes over an unverified one, or creates a new one", async () => {
  const { accounts, user, stores } = await registered();
  const linked = await accounts.loginWithGoogle({ sub: "g-1", email: "rosa@example.org", emailVerified: true, name: "Rosa" });
  assert.equal(linked.id, user.id);
  assert.equal((await accounts.loginWithGoogle({ sub: "g-1", email: "other@example.org", emailVerified: true, name: null })).id, user.id);

  // Compte non validé (ancien fonctionnement) : le vrai propriétaire, prouvé par Google, efface le mot de passe.
  await stores.users.create({ email: "squat@example.org", emailVerified: false, passwordHash: "attacker-hash", googleSub: null, displayName: "Squat" });
  const takenOver = await accounts.loginWithGoogle({ sub: "g-2", email: "squat@example.org", emailVerified: true, name: null });
  assert.equal(takenOver.passwordHash, null, "an unverified password cannot survive the real owner signing in");

  const fresh = await accounts.loginWithGoogle({ sub: "g-3", email: "new@example.org", emailVerified: true, name: "New" });
  assert.equal(fresh.displayName, null);
  await assert.rejects(accounts.loginWithGoogle({ sub: "g-4", email: "x@example.org", emailVerified: false, name: null }), (e) => code(e) === "google_email_not_verified");
});

test("profiles are visible to their owner and accepted friends only", async () => {
  const { accounts, mailer, stores, user: rosa } = await registered();
  const karlToken = await accounts.register({ email: "karl@example.org", password: "correct horse battery", displayName: "Karl" }, "3.3.3.3");
  const karl = await accounts.verifyEmail("karl@example.org", mailer.lastCodeFor("karl@example.org"), karlToken);
  assert.equal((await accounts.profile(rosa.id, rosa.id)).email, "rosa@example.org");
  await assert.rejects(accounts.profile(karl.id, rosa.id), (e) => code(e) === "forbidden");
  await stores.friends.request(karl.id, rosa.id);
  await assert.rejects(accounts.profile(karl.id, rosa.id), (e) => code(e) === "forbidden", "a pending request is not enough");
  await stores.friends.accept(rosa.id, karl.id);
  const seen = await accounts.profile(karl.id, rosa.id);
  assert.equal(seen.displayName, "Rosa");
  assert.equal(seen.email, undefined, "friends never see the email");
});

test("deleting an account removes friendships and detaches game logs", async () => {
  const { accounts, stores, user } = await registered();
  await stores.friends.request(user.id, "u_other");
  await stores.gameLogs.insertGame({
    id: "g1", roomCode: "R", startedAt: new Date(), endedAt: new Date(), outcome: "finished", ruleset: {},
    players: [{ playerId: "p1", userId: user.id, pseudo: "Rosa", faction: "nazi" }], turnOrder: [], confidenceHistory: [], missionHistory: [],
    scores: { nazi: 3, communist: 0 }, winner: "nazi", reason: "missions", forfeitedBy: null, chat: [], anonymizedAt: null,
  });
  await accounts.deleteAccount(user.id);
  assert.equal(await stores.users.findById(user.id), null);
  assert.deepEqual(await stores.friends.listFor(user.id), []);
  const logs = stores.gameLogs as MemoryGameLogStore;
  assert.equal(logs.games.get("g1")?.players[0]?.userId, null);
});
