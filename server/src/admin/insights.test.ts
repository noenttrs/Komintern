import assert from "node:assert/strict";
import test from "node:test";

import type { InsightGame } from "../store/gamelog";
import { computeInsights } from "./insights";

const NOW = new Date("2026-09-28T12:00:00Z"); // lundi
const at = (iso: string) => new Date(iso);

function game(overrides: Partial<InsightGame>): InsightGame {
  return {
    roomCode: "ROOM1",
    startedAt: at("2026-09-27T20:00:00Z"),
    endedAt: at("2026-09-27T20:20:00Z"),
    outcome: "finished",
    playerCount: 5,
    userIds: [],
    winner: "nazi",
    mode: "classic",
    replayChoices: { replay: 0, quit: 0 },
    ...overrides,
  };
}

test("insights: durations and wins per player count, replays, seats taken by accounts", () => {
  const games = [
    game({ userIds: ["u1"], replayChoices: { replay: 4, quit: 1 } }),
    // Même room, 5 minutes plus tard : la première partie a été rejouée.
    game({ startedAt: at("2026-09-27T20:25:00Z"), endedAt: at("2026-09-27T20:55:00Z"), winner: "communist", userIds: ["u1", "u2"] }),
    game({ roomCode: "ROOM2", playerCount: 2, mode: "duel", winner: null, startedAt: at("2026-09-26T10:00:00Z"), endedAt: at("2026-09-26T10:02:00Z") }),
    game({ roomCode: "ROOM3", outcome: "aborted", winner: null, endedAt: at("2026-09-25T10:00:00Z") }),
    game({ roomCode: "OLD", endedAt: at("2026-07-01T10:00:00Z"), startedAt: at("2026-07-01T09:00:00Z") }),
  ];
  const insights = computeInsights(games, [], NOW);
  assert.deepEqual([insights.kpis.finishedGames, insights.kpis.abortedGames], [3, 1], "the window is 30 days");
  assert.deepEqual(insights.byPlayerCount, [
    { players: 2, games: 1, medianMinutes: 2, naziWinRate: null },
    { players: 5, games: 2, medianMinutes: 25, naziWinRate: 0.5 },
  ]);
  assert.equal(insights.kpis.medianMinutes, 20);
  assert.deepEqual(insights.replay, { replay: 4, quit: 1, none: 7, replayedGames: 1, finishedGames: 3 });
  assert.equal(insights.kpis.replayRate, 0.333);
  assert.equal(insights.kpis.accountSeatShare, 0.25, "3 account seats out of 12");
  assert.equal(insights.kpis.activeAccounts7d, 2);
  assert.equal(insights.gamesPerDay.length, 30);
  assert.deepEqual(insights.gamesPerDay.at(-2), { day: "2026-09-27", finished: 2, aborted: 0 });
  assert.deepEqual(insights.modes, [{ mode: "classic", games: 2 }, { mode: "duel", games: 1 }]);
});

test("insights: weekly signups and retention, with future weeks left empty", () => {
  const accounts = [
    { id: "a", createdAt: at("2026-09-15T10:00:00Z"), verified: true },
    { id: "b", createdAt: at("2026-09-16T10:00:00Z"), verified: false },
  ];
  const games = [
    game({ userIds: ["a", "b"], endedAt: at("2026-09-16T20:00:00Z"), startedAt: at("2026-09-16T19:40:00Z") }),
    game({ userIds: ["a"], endedAt: at("2026-09-23T20:00:00Z"), startedAt: at("2026-09-23T19:40:00Z") }),
  ];
  const insights = computeInsights(games, accounts, NOW);
  assert.equal(insights.signupsPerWeek.length, 12);
  assert.deepEqual(insights.signupsPerWeek.at(-3), { week: "2026-09-14", signups: 2 });
  assert.deepEqual(insights.retention, [{ cohort: "2026-09-14", size: 2, weeks: [1, 0.5, 0, null, null] }]);
  assert.deepEqual([insights.kpis.accounts, insights.kpis.verifiedAccounts], [2, 1]);
});
