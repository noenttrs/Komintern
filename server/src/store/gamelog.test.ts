import assert from "node:assert/strict";
import test from "node:test";

import { ModerationService } from "../moderation/service";
import { MemoryGameLogStore, pseudonymFor } from "./gamelog";
import type { GameLog } from "./gamelog";

function game(id: string, endedAt: Date): GameLog {
  return {
    id, roomCode: "R", startedAt: endedAt, endedAt, outcome: "finished", ruleset: {},
    players: [
      { playerId: "p1", userId: "u_rosa", pseudo: "Rosa", faction: "nazi" },
      { playerId: "p2", userId: null, pseudo: "Karl", faction: "communist" },
    ],
    turnOrder: ["p1", "p2"], confidenceHistory: [], missionHistory: [], scores: { nazi: 3, communist: 1 }, winner: "nazi",
    reason: "missions", forfeitedBy: null, anonymizedAt: null,
    chat: [{ id: "m1", playerId: "p1", pseudo: "Rosa", text: "salut", masked: false, at: endedAt }],
  };
}

test("pseudonyms are stable letters", () => {
  assert.deepEqual([0, 1, 25, 26].map(pseudonymFor), ["Joueur A", "Joueur B", "Joueur Z", "Joueur AA"]);
});

test("old logs are anonymized except those under an open moderation case", async () => {
  const store = new MemoryGameLogStore();
  const old = new Date("2020-01-01");
  await store.insertGame(game("old", old));
  await store.insertGame(game("kept", old));
  await store.insertGame(game("recent", new Date()));
  const moderation = new ModerationService(store);
  await moderation.openCase({ trigger: { type: "flagged_word", words: ["x"] }, roomCode: "R", gameId: "kept", messages: [], involved: [] });

  const count = await store.anonymizeGamesBefore(new Date("2021-01-01"), await store.openCaseGameIds());
  assert.equal(count, 1);
  const anonymized = store.games.get("old");
  assert.deepEqual(anonymized?.players.map((p) => [p.userId, p.pseudo]), [[null, "Joueur A"], [null, "Joueur B"]]);
  assert.equal(anonymized?.chat[0]?.pseudo, "Joueur A");
  assert.equal(anonymized?.chat[0]?.text, "");
  assert.equal(store.games.get("kept")?.players[0]?.pseudo, "Rosa");
  assert.equal(store.games.get("recent")?.anonymizedAt, null);
});

test("moderation cases are pseudonymized and identities are stored apart", async () => {
  const store = new MemoryGameLogStore();
  const moderation = new ModerationService(store);
  const rosa = { playerId: "p1", userId: "u_rosa", pseudo: "Rosa" };
  const karl = { playerId: "p2", userId: null, pseudo: "Karl" };
  const id = await moderation.openCase({
    trigger: { type: "report", reporter: karl, reason: "insultes" },
    roomCode: "R",
    gameId: null,
    messages: [
      { ...rosa, text: "Karl tu es nul", at: 1, flagged: false },
      { ...karl, text: "stop", at: 2, flagged: false },
    ],
    involved: [karl, rosa],
  });
  const moderationCase = await store.getCase(id);
  assert.deepEqual(moderationCase?.messages.map((m) => `${m.pseudonym}: ${m.text}`), ["Joueur A: [joueur] tu es nul", "Joueur B: stop"]);
  assert.deepEqual(moderationCase?.trigger, { type: "report", reporter: "Joueur B", reason: "insultes" });
  assert.ok(!JSON.stringify(moderationCase).includes("Rosa"));
  const identities = await store.getIdentities(id);
  assert.deepEqual(identities.map((i) => [i.pseudonym, i.userId]), [["Joueur A", "u_rosa"], ["Joueur B", null]]);
});

test("the admin game list is anonymous: no pseudo, account or message", async () => {
  const store = new MemoryGameLogStore();
  await store.insertGame({ ...game("g1", new Date("2026-01-02T10:05:00Z")), startedAt: new Date("2026-01-02T10:00:00Z"), ruleset: { ruleset_preset: "PRESET_5J" } });
  await store.insertGame({ ...game("g2", new Date("2026-01-03T10:00:00Z")), ruleset: { mode: "duel" }, duel: { winners: ["p1", "p2"], reason: "mutual_trust" } });
  const rows = await store.recentGames(10);
  assert.deepEqual(rows.map((row) => row.id), ["g2", "g1"]);
  assert.deepEqual([rows[1]?.format, rows[1]?.durationSeconds, rows[1]?.accounts, rows[1]?.chatMessages], ["5J", 300, 1, 1]);
  assert.deepEqual([rows[0]?.mode, rows[0]?.duelWinners], ["duel", 2]);
  const text = JSON.stringify(rows);
  for (const secret of ["Rosa", "Karl", "u_rosa", "salut", "p1"]) assert.equal(text.includes(secret), false, secret);
  assert.deepEqual((await store.recentGames(10, new Date("2026-01-03T00:00:00Z"))).map((row) => row.id), ["g1"]);
});

test("resolved cases lose their messages and identities after the retention period", async () => {
  const store = new MemoryGameLogStore();
  const message = { pseudonym: "Joueur A", text: "mon numéro : 06…", at: new Date(), flagged: true };
  const identities = [{ pseudonym: "Joueur A", playerId: "p1", userId: "u_rosa", pseudo: "Rosa" }];
  const base = { trigger: { type: "flagged_word" as const, words: ["x"] }, roomCode: "R", gameId: null, resolution: null, resolvedAt: null };
  await store.createCase({ ...base, id: "old", createdAt: new Date("2020-01-01"), status: "open", messages: [message] }, identities);
  await store.createCase({ ...base, id: "open", createdAt: new Date("2020-01-01"), status: "open", messages: [message] }, identities);
  await store.resolveCase("old", "averti");
  store.cases.get("old")!.resolvedAt = new Date("2020-02-01");

  assert.equal(await store.purgeResolvedCasesBefore(new Date("2021-01-01")), 1);
  assert.deepEqual((await store.getCase("old"))?.messages, []);
  assert.equal((await store.getCase("old"))?.resolution, "averti");
  assert.deepEqual(await store.getIdentities("old"), []);
  assert.equal((await store.getCase("open"))?.messages.length, 1);
  assert.equal((await store.getIdentities("open")).length, 1);
});

test("aborted games are left out of the admin history and recent counters", async () => {
  const store = new MemoryGameLogStore();
  const now = new Date();
  await store.insertGame(game("done", now));
  await store.insertGame({ ...game("cancelled", now), outcome: "aborted" });
  assert.deepEqual((await store.recentGames(10)).map((row) => row.id), ["done"]);
  const stats = await store.stats(now);
  assert.deepEqual([stats.last24h, stats.last7d, stats.finished, stats.aborted], [1, 1, 1, 1]);
});
