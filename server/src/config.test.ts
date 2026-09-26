import assert from "node:assert/strict";
import test from "node:test";

import { isTestRoom, loadConfig } from "./config";

test("test rooms need the secret prefix, longer than a random code", () => {
  const config = loadConfig({ TEST_ROOM_PREFIX: "ABCDEFGH234567" });
  assert.equal(config.testRoomPrefix, "ABCDEFGH234567");
  assert.equal(isTestRoom(config, "ABCDEFGH234567-X7K2"), true);
  assert.equal(isTestRoom(config, "ABCDEFGH234567"), false, "the prefix alone is not a test room");
  assert.equal(isTestRoom(config, "K7M2Q9XA"), false);
  for (const weak of ["", "SHORT", "abcdefgh234567", "ABCDEFGH-34567", "ABCDEFGHIJKLMNOPQ"]) {
    const disabled = loadConfig({ TEST_ROOM_PREFIX: weak });
    assert.equal(disabled.testRoomPrefix, undefined, weak);
    assert.equal(isTestRoom(disabled, `${weak}-X7K2`), false);
  }
});
