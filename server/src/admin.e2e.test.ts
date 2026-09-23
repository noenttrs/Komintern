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
  assert.deepEqual((await api("/admin/session", { cookie: login.cookie })).body, { elevated: false });
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

  // Contact et bannissement depuis l'admin
  const messages = (await api("/admin/contact", { cookie: login.cookie })).body.messages;
  assert.equal(messages[0].subject, "Bug");
  assert.equal((await api(`/admin/contact/${messages[0].id}/read`, { body: { read: true }, cookie: login.cookie })).status, 204);
  const banned = await api(`/admin/users/${player.id}/ban`, { body: { days: 7 }, cookie: login.cookie });
  assert.ok(new Date(banned.body.bannedUntil) > new Date());
  assert.equal((await api("/auth/login", { body: { email: "p@example.org", password: "player password 1" } })).body.error.code, "banned");

  // Le compte admin ne peut pas passer par Google
  await assert.rejects(
    app.services.accounts.loginWithGoogle({ sub: "g-admin", email: "admin@example.org", emailVerified: true, name: null }),
    /admin_password_only/,
  );
});
