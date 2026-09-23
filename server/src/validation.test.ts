import assert from "node:assert/strict";
import test from "node:test";

import { parseOptionalPlayerUid, parseOptionalRoomCode, parsePositiveIntEnv, parsePseudo, parseTeam } from "./validation";

test("room codes are normalized and validated", () => {
  assert.equal(parseOptionalRoomCode(" abc 12 "), "ABC-12");
  assert.equal(parseOptionalRoomCode(""), undefined);
  assert.throws(() => parseOptionalRoomCode("a!"), /room code/);
  assert.throws(() => parseOptionalRoomCode(42), /must be a string/);
});

test("pseudos are trimmed, stripped of invisible characters and capped", () => {
  assert.equal(parsePseudo("  Rosa   Luxemburg "), "Rosa Luxemburg");
  assert.equal(parsePseudo("Zé​ro"), "Zéro");
  assert.throws(() => parsePseudo("x".repeat(21)), /at most 20/);
  assert.throws(() => parsePseudo("   "), /non-empty/);
});

test("player uids must look like secrets", () => {
  assert.equal(parseOptionalPlayerUid(undefined), undefined);
  assert.equal(parseOptionalPlayerUid("abcdefghijklmnop"), "abcdefghijklmnop");
  assert.throws(() => parseOptionalPlayerUid("short"), /playerUid/);
});

test("teams must be arrays of strings", () => {
  assert.deepEqual(parseTeam(["a", "b"]), ["a", "b"]);
  assert.throws(() => parseTeam("a"), /array/);
  assert.throws(() => parseTeam([1]), /array/);
});

test("numeric env vars fall back on invalid values instead of NaN", () => {
  assert.equal(parsePositiveIntEnv("abc", 80), 80);
  assert.equal(parsePositiveIntEnv("-5", 80), 80);
  assert.equal(parsePositiveIntEnv("12", 80), 12);
  assert.equal(parsePositiveIntEnv(undefined, 80), 80);
});
