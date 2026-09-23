import assert from "node:assert/strict";
import test from "node:test";

import { getPresetNameForPlayerCount, parseRuleset, resolveRulesetForPlayerCount } from "./rulesets";

const BASE = {
  player_count: 5,
  nazi_count: 2,
  communist_count: 3,
  mission_sizes: [2, 3, 2, 3, 3],
  mission_count: 5,
  win_threshold: 3,
  info_mode: "full",
  experimental: false,
};

test("resolveRulesetForPlayerCount infers the matching playable preset", () => {
  const resolved = resolveRulesetForPlayerCount(5);
  assert.equal(resolved.playerCount, 5);
  assert.deepEqual(resolved.missionSizes, [2, 3, 2, 3, 3]);
  assert.equal(getPresetNameForPlayerCount(4), "PRESET_4J");
  assert.equal(getPresetNameForPlayerCount(7), null, "placeholder presets are not playable");
  assert.throws(() => resolveRulesetForPlayerCount(7), /no playable ruleset/);
});

test("parseRuleset mirrors the engine validation", () => {
  assert.deepEqual(parseRuleset(BASE).mission_sizes, [2, 3, 2, 3, 3]);
  const invalid: Array<[string, Record<string, unknown>, RegExp]> = [
    ["length", { mission_sizes: [2, 3] }, /mission_sizes length/],
    ["zero size", { mission_sizes: [0, 3, 2, 3, 3] }, /between 1 and player_count/],
    ["oversized", { mission_sizes: [6, 3, 2, 3, 3] }, /between 1 and player_count/],
    ["draw", { mission_sizes: [2, 3, 2, 3], mission_count: 4 }, /draw would be possible/],
    ["threshold", { win_threshold: 0 }, /win_threshold must be >= 1/],
    ["negative", { nazi_count: -1, communist_count: 6 }, /each faction/],
    ["blind", { info_mode: "blind" }, /blind mode/],
    ["float", { player_count: 5.5 }, /must be an integer/],
  ];
  for (const [name, overrides, expected] of invalid) {
    assert.throws(() => parseRuleset({ ...BASE, ...overrides }), expected, name);
  }
});
