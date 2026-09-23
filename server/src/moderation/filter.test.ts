import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadWordList, parseWordList, scanMessage } from "./filter";

const list = parseWordList("# commentaire\n@menaces\nje vais te tuer\n@homophobie\npd\n@incitation-au-suicide\nsuicide toi\n");
const terms = (text: string, words = list) => scanMessage(text, words).map((entry) => entry.term);

test("flagged terms are found whatever the case, accents, leetspeak or repetitions, with their category", () => {
  assert.deepEqual(scanMessage("Espèce de PD", list), [{ term: "pd", category: "homophobie" }]);
  assert.deepEqual(terms("Suicide-toi"), ["suicide toi"]);
  assert.deepEqual(terms("JE VAIS TE TUEEEER"), ["je vais te tuer"]);
});

test("short words only match whole tokens", () => {
  assert.deepEqual(terms("pdf et rapidement"), []);
});

test("personal details are flagged as doxxing", () => {
  assert.deepEqual(scanMessage("appelle le 06 12 34 56 78", list), [{ term: "numéro de téléphone", category: "donnees-personnelles" }]);
  assert.deepEqual(terms("+33 6 12 34 56 78"), ["numéro de téléphone"]);
  assert.deepEqual(terms("son mail c'est karl@example.org"), ["adresse email"]);
  assert.deepEqual(terms("on était 12 à 20 h, score 3-2"), []);
});

test("the shipped list: game vocabulary and friendly banter are never flagged, hate and threats are", () => {
  const shipped = loadWordList(path.resolve(__dirname, "../../moderation/flagged-words.txt"));
  assert.ok(shipped.words.size + shipped.phrases.length > 80);
  for (const banter of ["Les nazis ont saboté, vive les communistes, fasciste !", "t'es un connard, putain j'y croyais", "traître ! facho ! saboteur !", "Heil... non je rigole, je vote pour"]) {
    assert.deepEqual(terms(banter, shipped), [], banter);
  }
  assert.deepEqual(scanMessage("sale juif", shipped), [{ term: "sale juif", category: "racisme" }]);
  assert.deepEqual(scanMessage("je sais où tu habites", shipped), [{ term: "je sais ou tu habites", category: "menaces" }]);
  assert.deepEqual(scanMessage("kys", shipped), [{ term: "kys", category: "incitation-au-suicide" }]);
});
