import { describe, expect, it } from "vitest";

import { translate } from "../i18n";
import { duelExplanation } from "./DuelScreens";

const names: Record<string, string> = { a: "Rosa", b: "Karl" };
const t = (key: Parameters<typeof translate>[0], vars?: Record<string, string>) => translate(key, vars);

describe("duelExplanation", () => {
  it("names the right people for each outcome", () => {
    const base = { winners: [], forfeitedBy: null };
    expect(duelExplanation({ ...base, reason: "nazi_unmasked", roleMap: { a: "communist", b: "nazi" }, votes: { a: "accuse", b: "trust" } }, (id) => names[id]!, t)).toBe(
      "Rosa a démasqué le nazi Karl.",
    );
    expect(duelExplanation({ ...base, reason: "false_accusation", roleMap: { a: "communist", b: "communist" }, votes: { a: "trust", b: "accuse" } }, (id) => names[id]!, t)).toBe(
      "Deux communistes : Karl a accusé à tort et perd.",
    );
    expect(duelExplanation({ ...base, reason: "forfeit", forfeitedBy: "b", roleMap: { a: "nazi", b: "nazi" }, votes: {} }, (id) => names[id]!, t)).toBe(
      "Karl est parti : l'autre joueur gagne.",
    );
    expect(duelExplanation({ ...base, reason: "hacked", roleMap: {}, votes: {} }, (id) => names[id]!, t)).toBe("");
  });
});
