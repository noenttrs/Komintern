import assert from "node:assert/strict";
import test from "node:test";

import { resolveRulesetForPlayerCount } from "./rulesets";

test("resolveRulesetForPlayerCount infers the matching preset", () => {
  const resolved = resolveRulesetForPlayerCount(5);

  assert.equal(resolved.playerCount, 5);
  assert.deepEqual(resolved.missionSizes, [2, 3, 2, 3, 3]);
});

test("resolveRulesetForPlayerCount rejects malformed custom rulesets", () => {
  assert.throws(
    () =>
      resolveRulesetForPlayerCount(5, undefined, {
        player_count: 5,
        nazi_count: 2,
        communist_count: 3,
        mission_sizes: [2, 3],
        mission_count: 5,
        win_threshold: 3,
        info_mode: "full",
        experimental: false,
      }),
    /mission_sizes length must equal mission_count/,
  );
});
