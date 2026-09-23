import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { createKominternApp } from "./app";
import type { KominternApp } from "./app";
import { MemoryMailer } from "./auth/mailer";
import { hashPassword } from "./auth/passwords";
import { currentCounter, generateTotpSecret, totpCode } from "./auth/totp";
import { loadConfig } from "./config";
import { memoryStores } from "./services";

const ORIGIN = "http://localhost:8080";
const mailer = new MemoryMailer();
const stores = memoryStores(mailer);
const secret = generateTotpSecret();
let app: KominternApp;
let base: string;

before(async () => {
  app = createKominternApp({
    pythonPath: "python3",
    enginePath: "unused",
    allowedOrigins: ["*"],
    rateLimitMaxEvents: 1_000,
    rateLimitWindowMs: 10_000,
    config: loadConfig({ PUBLIC_URL: ORIGIN, LEGAL_CONTACT_EMAIL: "contact@example.org", DONATION_URL: "https://ko-fi.com/komintern" }),
    stores,
  });
  await new Promise<void>((resolve) => app.httpServer.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
  const adminUser = await stores.users.create({
    email: "admin@example.org",
    emailVerified: true,
    passwordHash: await hashPassword("admin password 123"),
    googleSub: null,
    displayName: "Admin",
  });
  await stores.users.update(adminUser.id, { role: "admin", totpSecret: secret });
});

after(async () => {
  await app.close();
});

async function api(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(init.cookie === undefined ? {} : { Cookie: init.cookie }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? {} : JSON.parse(text), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

test("contact form, donation link, admin area behind role + TOTP", async () => {
  assert.equal((await api("/config")).body.donationUrl, "https://ko-fi.com/komintern");
  assert.deepEqual((await api("/health")).body, { status: "ok", redis: true, mongo: true });

  // Contact public : stocké et transféré à la boîte de contact, avec reply-to
  assert.equal((await api("/contact", { body: { email: "rosa@example.org", subject: "Bug", message: "trop court" } })).status, 202);
  assert.equal((await api("/contact", { body: { email: "rosa@example.org", subject: "Bug", message: "court" } })).status, 400);
  const forwarded = mailer.sent.find((mail) => mail.to === "contact@example.org");
  assert.equal(forwarded?.replyTo, "rosa@example.org");
  assert.match(forwarded?.subject ?? "", /\[Contact\] Bug/);

  // Visiteur et joueur ordinaire : la zone admin n'existe pas
  assert.equal((await api("/admin/stats")).status, 404);
  const player = await stores.users.create({ email: "p@example.org", emailVerified: true, passwordHash: await hashPassword("player password 1"), googleSub: null, displayName: "Player" });
  const playerLogin = await api("/auth/login", { body: { email: "p@example.org", password: "player password 1" } });
  assert.equal((await api("/admin/stats", { cookie: playerLogin.cookie })).status, 404);
  assert.equal((await api("/me", { cookie: playerLogin.cookie })).body.user.isAdmin, false);

  // Admin : mot de passe puis TOTP obligatoire
  const login = await api("/auth/login", { body: { email: "admin@example.org", password: "admin password 123" } });
  assert.equal((await api("/me", { cookie: login.cookie })).body.user.isAdmin, true);
  assert.deepEqual((await api("/admin/session", { cookie: login.cookie })).body, { elevated: false, role: "admin", totpEnabled: true });
  assert.deepEqual((await api("/admin/stats", { cookie: login.cookie })).body, { error: { code: "totp_required" } });
  assert.equal((await api("/admin/session", { body: { code: "000000" }, cookie: login.cookie })).status, 401);
  const code = totpCode(secret, currentCounter());
  assert.equal((await api("/admin/session", { body: { code }, cookie: login.cookie })).status, 200);

  const stats = await api("/admin/stats", { cookie: login.cookie });
  assert.equal(stats.status, 200);
  assert.equal(stats.body.users.total, 2);
  assert.equal(stats.body.unreadContact, 1);
  assert.deepEqual(Object.keys(stats.body.live).sort(), ["connectedPlayers", "gamesInProgress", "players", "rooms"]);

  // Un code TOTP ne sert qu'une fois (autre session, même code)
  const second = await api("/auth/login", { body: { email: "admin@example.org", password: "admin password 123" } });
  assert.equal((await api("/admin/session", { body: { code }, cookie: second.cookie })).status, 401);

  // Mesure d'audience : visiteurs uniques et pages vues, chemins normalisés, robots ignorés
  for (const path of ["/", "/r/AB12CD", "/regles", "/nimporte-quoi"]) {
    assert.equal((await api("/visit", { body: { path } })).status, 204);
  }
  const audience = (await api("/admin/audience", { cookie: login.cookie })).body;
  const today = audience.daily.at(-1);
  assert.equal(today.visitors, 1);
  assert.equal(today.pageviews, 3);
  assert.deepEqual(audience.topPages.map((page: { path: string }) => page.path).sort(), ["/", "/r/:code", "/regles"]);

  // Contact et bannissement depuis l'admin
  const messages = (await api("/admin/contact", { cookie: login.cookie })).body.messages;
  assert.equal(messages[0].subject, "Bug");
  assert.equal((await api(`/admin/contact/${messages[0].id}/read`, { body: { read: true }, cookie: login.cookie })).status, 204);
  // Avertissement : vu par le joueur à sa prochaine visite, puis marqué lu
  assert.equal((await api("/admin/users?q=pl", { cookie: login.cookie })).body.users[0].displayName, "Player");
  assert.equal((await api("/admin/users?q=p", { cookie: login.cookie })).body.users.length, 0, "at least 2 characters");
  const warned = await api(`/admin/users/${player.id}/warn`, { body: { reason: "Propos insultants dans le chat" }, cookie: login.cookie });
  assert.equal(warned.status, 200);
  const me = (await api("/me", { cookie: playerLogin.cookie })).body.user;
  assert.deepEqual(me.pendingWarnings.map((warning: { reason: string }) => warning.reason), ["Propos insultants dans le chat"]);
  assert.equal((await api("/me/warnings/seen", { body: {}, cookie: playerLogin.cookie })).status, 204);
  assert.deepEqual((await api("/me", { cookie: playerLogin.cookie })).body.user.pendingWarnings, []);
  const sanctioned = (await api("/admin/users?sanctioned=1", { cookie: login.cookie })).body.users;
  assert.deepEqual(sanctioned.map((user: { warnings: Array<{ seen: boolean }> }) => user.warnings.map((warning) => warning.seen)), [[true]]);
  assert.equal(JSON.stringify(sanctioned).includes("passwordHash"), false);

  // Parties vues par l'admin : anonymes (ni pseudo, ni compte, ni message)
  const games = await api("/admin/games", { cookie: login.cookie });
  assert.equal(games.status, 200);
  assert.ok(Array.isArray(games.body.games));

  const banned = await api(`/admin/users/${player.id}/ban`, { body: { days: 7, reason: "Récidive" }, cookie: login.cookie });
  assert.ok(new Date(banned.body.bannedUntil) > new Date());
  assert.equal((await api("/auth/login", { body: { email: "p@example.org", password: "player password 1" } })).body.error.code, "banned");

  // Le compte admin ne peut pas passer par Google
  await assert.rejects(
    app.services.accounts.loginWithGoogle({ sub: "g-admin", email: "admin@example.org", emailVerified: true, name: null }),
    /admin_password_only/,
  );
});

test("moderation panel: anonymous cases, sanctions applied by the server, permanent bans decided by the admin", async () => {
  const login = async (email: string, password: string) => (await api("/auth/login", { body: { email, password } })).cookie as string;
  const make = async (email: string, name: string) =>
    stores.users.create({ email, emailVerified: true, passwordHash: await hashPassword("some password 123"), googleSub: null, displayName: name });
  const mod = await make("mod@example.org", "Modo");
  const offender = await make("t@example.org", "Target");

  // L'admin nomme le modérateur (code suivant : un code ne sert qu'une fois)
  const adminCookie = await login("admin@example.org", "admin password 123");
  assert.equal((await api("/admin/session", { body: { code: totpCode(secret, currentCounter() + 1) }, cookie: adminCookie })).status, 200);
  assert.equal((await api(`/admin/users/${mod.id}/role`, { body: { role: "moderator" }, cookie: adminCookie })).status, 204);

  // Sans double authentification, pas d'accès au panel de modération ; le panel admin n'existe pas pour lui
  let modCookie = await login("mod@example.org", "some password 123");
  assert.equal((await api("/me", { cookie: modCookie })).body.user.isModerator, true);
  assert.deepEqual((await api("/moderation/session", { cookie: modCookie })).body, { elevated: false, role: "moderator", totpEnabled: false });
  assert.equal((await api("/moderation/session", { body: { code: "123456" }, cookie: modCookie })).body.error.code, "totp_setup_required");
  assert.equal((await api("/admin/session", { cookie: modCookie })).status, 404);

  const modSecret = generateTotpSecret();
  await stores.users.update(mod.id, { totpSecret: modSecret });
  const challenge = (await api("/auth/login", { body: { email: "mod@example.org", password: "some password 123" } })).body;
  modCookie = (await api("/auth/login/totp", { body: { token: challenge.token, code: totpCode(modSecret, currentCounter()) } })).cookie as string;
  assert.equal((await api("/moderation/session", { body: { code: totpCode(modSecret, currentCounter() + 1) }, cookie: modCookie })).status, 200);
  for (const path of ["/admin/stats", "/admin/reports", "/admin/users?sanctioned=1", "/admin/ban-requests"]) {
    assert.equal((await api(path, { cookie: modCookie })).status, 404, path);
  }

  // Un dossier : un joueur avec compte, un invité
  const caseId = await app.services.moderation.openCase({
    trigger: { type: "flagged_word", words: ["je sais ou tu habites"] },
    roomCode: "ROOM",
    gameId: null,
    messages: [{ playerId: "p1", userId: offender.id, pseudo: "Target", text: "je sais où tu habites", at: Date.now(), flagged: true }],
    involved: [{ playerId: "p1", userId: offender.id, pseudo: "Target" }, { playerId: "p2", userId: null, pseudo: "Invité" }],
  });
  const detail = (await api(`/moderation/cases/${caseId}`, { cookie: modCookie })).body;
  assert.deepEqual(detail.participants.map((p: { pseudonym: string; kind: string }) => [p.pseudonym, p.kind]), [["Joueur A", "account"], ["Joueur B", "guest"]]);
  const text = JSON.stringify(detail);
  for (const secretValue of ["Target", "t@example.org", offender.id, "Invité"]) assert.equal(text.includes(secretValue), false, secretValue);

  // Le modérateur choisit une conséquence ; le serveur l'applique sans révéler la personne
  const sanction = (body: Record<string, unknown>) => api(`/moderation/cases/${caseId}/sanction`, { body, cookie: modCookie });
  assert.equal((await sanction({ pseudonym: "Joueur A", type: "mute", duration: 48, reason: "x" })).body.error.code, "invalid_input");
  assert.equal((await sanction({ pseudonym: "Joueur A", type: "mute", duration: 24, reason: "" })).body.error.code, "reason_required");
  assert.deepEqual((await sanction({ pseudonym: "Joueur A", type: "mute", duration: 24, reason: "Menaces" })).body, { applied: "mute" });
  assert.equal((await sanction({ pseudonym: "Joueur B", type: "warn", reason: "x" })).body.error.code, "guest_not_sanctionable");
  const offenderAfter = await stores.users.findById(offender.id);
  assert.ok(offenderAfter!.chatMutedUntil! > new Date(Date.now() + 23 * 3600 * 1000));
  assert.match(offenderAfter!.warnings.at(-1)!.reason, /Chat coupé 24 h : Menaces/);
  assert.equal((await api(`/moderation/cases/${caseId}`, { cookie: modCookie })).body.participants[0].restriction, "muted");

  // Demande de ban définitif → l'admin la voit avec le dossier et la personne, puis tranche
  assert.deepEqual((await sanction({ pseudonym: "Joueur A", type: "ban_request", reason: "Menaces répétées" })).body, { applied: "ban_request" });
  assert.equal((await sanction({ pseudonym: "Joueur A", type: "ban_request", reason: "encore" })).body.error.code, "ban_request_pending");
  const requests = (await api("/admin/ban-requests", { cookie: adminCookie })).body.requests;
  assert.equal(requests.length, 1);
  assert.equal(requests[0].target.displayName, "Target");
  assert.equal(requests[0].case.id, caseId);
  assert.equal((await api(`/admin/ban-requests/${requests[0].id}/accept`, { body: {}, cookie: adminCookie })).status, 204);
  assert.equal((await api("/auth/login", { body: { email: "t@example.org", password: "some password 123" } })).body.error.code, "banned");
  const banned = (await api("/admin/users?q=target", { cookie: adminCookie })).body.users[0];
  assert.equal(banned.permanentBan, true);

  // L'admin lève toutes les sanctions : ban définitif abrogé, chat rétabli, avertissements retirés
  assert.equal((await api(`/admin/users/${offender.id}/clear-sanctions`, { body: {}, cookie: adminCookie })).status, 204);
  const cleared = (await api("/admin/users?q=target", { cookie: adminCookie })).body.users[0];
  assert.deepEqual([cleared.bannedUntil, cleared.chatMutedUntil, cleared.warnings.length, cleared.sanctions.every((s: { revoked: boolean }) => s.revoked)], [null, null, 0, true]);
  await login("t@example.org", "some password 123");

  // Rôle retiré : plus de panel de modération
  assert.equal((await api(`/admin/users/${mod.id}/role`, { body: { role: null }, cookie: adminCookie })).status, 204);
  assert.equal((await api("/moderation/cases", { cookie: modCookie })).status, 404);
});
