import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { filterMessage, loadWordList, parseWordList } from "./filter";

const list = parseWordList("# commentaire\nconnard\npd\nsuicide toi\n");

test("flagged words are masked, whatever the case, accents, leetspeak or repetitions", () => {
  assert.deepEqual(filterMessage("T'es un CONNARD", list), { masked: "T'es un *******", flagged: ["connard"] });
  assert.equal(filterMessage("c0nnnnard !", list).masked, "********* !");
  assert.deepEqual(filterMessage("Suicide-toi", list).flagged, ["suicide toi"]);
});

test("short words only match whole tokens", () => {
  assert.deepEqual(filterMessage("pdf et rapidement", list).flagged, []);
  assert.deepEqual(filterMessage("espèce de PD", list).flagged, ["pd"]);
});

test("the game vocabulary is never flagged by the shipped list", () => {
  const shipped = loadWordList(path.resolve(__dirname, "../../moderation/flagged-words.txt"));
  assert.ok(shipped.words.size > 10);
  assert.deepEqual(filterMessage("Les nazis ont saboté, vive les communistes, fasciste !", shipped).flagged, []);
});
