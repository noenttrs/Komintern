import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { createKominternApp } from "./app";
import type { KominternApp } from "./app";
import { MemoryMailer } from "./auth/mailer";
import { hashPassword } from "./auth/passwords";
import { currentCounter, totpCode } from "./auth/totp";
import { loadConfig } from "./config";
import { memoryStores } from "./services";

const ORIGIN = "http://localhost:8080";
const mailer = new MemoryMailer();
const stores = memoryStores(mailer);
let app: KominternApp;
let base: string;

before(async () => {
  app = createKominternApp({
    pythonPath: "python3",
    enginePath: "unused",
    allowedOrigins: ["*"],
    rateLimitMaxEvents: 1_000,
    rateLimitWindowMs: 10_000,
    config: loadConfig({ PUBLIC_URL: ORIGIN }),
    stores,
  });
  await new Promise<void>((resolve) => app.httpServer.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
  await stores.users.create({ email: "rosa@example.org", emailVerified: true, passwordHash: await hashPassword("rosa password 123"), googleSub: null, displayName: "Rosa" });
  await stores.users.create({ email: "karl@example.org", emailVerified: true, passwordHash: await hashPassword("karl password 123"), googleSub: null, displayName: "Karl" });
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

test("optional two-factor authentication for players", async () => {
  const login = await api("/auth/login", { body: { email: "rosa@example.org", password: "rosa password 123" } });
  const cookie = login.cookie;
  const { secret, uri } = (await api("/me/totp/setup", { body: {}, cookie })).body;
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.equal((await api("/me/totp/enable", { body: { code: "000000" }, cookie })).status, 401);
  assert.equal((await api("/me/totp/enable", { body: { code: totpCode(secret, currentCounter()) }, cookie })).status, 204);
  assert.equal((await api("/me", { cookie })).body.user.totpEnabled, true);

  // Connexion suivante : le mot de passe ne suffit plus.
  const challenge = await api("/auth/login", { body: { email: "rosa@example.org", password: "rosa password 123" } });
  assert.equal(challenge.body.totpRequired, true);
  assert.equal(challenge.cookie, undefined, "no session before the second factor");
  assert.equal((await api("/auth/login/totp", { body: { token: challenge.body.token, code: "123456" } })).status, 401);
  const next = totpCode(secret, currentCounter() + 1);
  const done = await api("/auth/login/totp", { body: { token: challenge.body.token, code: next } });
  assert.equal(done.status, 200);
  assert.match(done.cookie ?? "", /^sid=/);

  // Désactivation avec un nouveau code (les codes déjà utilisés sont refusés).
  assert.equal((await api("/me/totp/disable", { body: { code: next }, cookie })).status, 401);
});

test("changing the email requires the password and a code sent to the new address", async () => {
  const { cookie } = await api("/auth/login", { body: { email: "karl@example.org", password: "karl password 123" } });
  assert.equal((await api("/me/email", { body: { email: "new@example.org", password: "wrong password" }, cookie })).status, 401);
  assert.equal((await api("/me/email", { body: { email: "rosa@example.org", password: "karl password 123" }, cookie })).body.error.code, "email_taken");
  assert.equal((await api("/me/email", { body: { email: "karl.new@example.org", password: "karl password 123" }, cookie })).status, 202);
  const code = mailer.lastCodeFor("karl.new@example.org");
  const confirmed = await api("/me/email/confirm", { body: { code }, cookie });
  assert.equal(confirmed.body.user.email, "karl.new@example.org");
  assert.ok(mailer.sent.some((mail) => mail.to === "karl@example.org" && /modifiée/.test(mail.subject)), "the old address is warned");
  assert.equal((await api("/auth/login", { body: { email: "karl.new@example.org", password: "karl password 123" } })).status, 200);
});
