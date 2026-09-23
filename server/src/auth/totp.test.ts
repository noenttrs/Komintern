import assert from "node:assert/strict";
import test from "node:test";

import { generateTotpSecret, otpauthUri, totpCode, verifyTotp } from "./totp";

// Vecteur de test de la RFC 6238 : secret ASCII "12345678901234567890", T = 59 s → 94287082.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("matches the RFC 6238 test vector", () => {
  assert.equal(totpCode(RFC_SECRET, 1), "287082");
  assert.equal(verifyTotp(RFC_SECRET, "287082", 59_000), 1);
});

test("accepts one step of clock drift, rejects the rest", () => {
  const secret = generateTotpSecret();
  const now = 1_800_000_000_000;
  const counter = Math.floor(now / 30_000);
  assert.equal(verifyTotp(secret, totpCode(secret, counter - 1), now), counter - 1);
  assert.equal(verifyTotp(secret, totpCode(secret, counter - 3), now), null);
  assert.equal(verifyTotp(secret, "12345", now), null);
});

test("builds an otpauth URI for authenticator apps", () => {
  assert.match(otpauthUri("ABC", "admin@example.org"), /^otpauth:\/\/totp\/Nazi%20Communiste%3Aadmin%40example\.org\?secret=ABC&issuer=/);
});
