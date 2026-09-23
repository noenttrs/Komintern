import assert from "node:assert/strict";
import test from "node:test";

import { GameSession } from "./GameSession";
import type { SessionConfig } from "./GameSession";
import { resolveRulesetForPlayerCount } from "./rulesets";
import { FakeBridge, createIoRecorder } from "./test-utils/fakes";
import type { ResyncPayload } from "./types";

const PLAYERS = ["p1", "p2", "p3", "p4", "p5"];
const ROLES = { p1: "nazi", p2: "nazi", p3: "communist", p4: "communist", p5: "communist" } as const;

function setup(overrides: Partial<SessionConfig> = {}) {
  const bridge = new FakeBridge({ ...ROLES });
  const recorder = createIoRecorder();
  const active = new Set(PLAYERS);
  const sockets = new Map(PLAYERS.map((id) => [id, `socket-${id}`]));
  const state = { finished: null as string | null | undefined, aborted: false, revealed: false };
  const session = new GameSession("ROOM", PLAYERS, sockets, recorder.io, {
    ruleset: resolveRulesetForPlayerCount(5),
    getActivePlayerIds: () => PLAYERS.filter((id) => active.has(id)),
    getRoomPayload: () => ({ players: [], code: "ROOM", hostPlayerId: "p1", targetPlayerCount: 5, minPlayers: 5, maxPlayers: 5, status: "playing", chatEnabled: true }),
    getHostPlayerId: () => "p1",
    onRevealComplete: () => {
      state.revealed = true;
    },
    onGameFinished: (nextChefId) => {
      state.finished = nextChefId;
    },
    onAborted: () => {
      state.aborted = true;
    },
    randomIndexProvider: () => 0,
    revealPauseMs: 0,
    bridge,
    ...overrides,
  });
  return { session, bridge, active, state, ...recorder };
}

async function toProposing(session: GameSession, players = PLAYERS): Promise<void> {
  await session.start();
  for (const id of players) {
    await session.handleTableOrderTap(id);
  }
  for (const id of players) {
    await session.confirmTableOrder(id);
  }
  for (const id of players) {
    await session.confirmRoleReveal(id);
  }
}

function chefOf(events: ReturnType<typeof createIoRecorder>["events"]): string {
  const proposal = [...events].reverse().find((entry) => entry.event === "proposal_phase");
  return (proposal?.payload as { chef: string }).chef;
}

async function playRound(session: GameSession, chef: string, team: string[], approve: boolean, sabotage = false): Promise<void> {
  await session.handleProposeTeam(chef, team);
  for (const id of PLAYERS) {
    await session.handleConfidenceVote(id, approve ? "yes" : "no");
  }
  for (const id of PLAYERS) {
    await session.confirmConfidenceResult(id);
  }
  if (!approve) {
    return;
  }
  for (const id of team) {
    await session.handleMissionVote(id, sabotage && ROLES[id as keyof typeof ROLES] === "nazi" ? "nazi" : "communist");
  }
  for (const id of PLAYERS) {
    await session.confirmMissionResult(id);
  }
}

test("a full game: chef keeps the round after a rejection and rotates on each new round", async () => {
  const { session, events, state, bridge } = setup();
  await toProposing(session);
  assert.equal(state.revealed, true);
  assert.equal(chefOf(events), "p1");

  await playRound(session, "p1", ["p3", "p4"], false);
  assert.equal(chefOf(events), "p1", "same chef after a rejection");

  await playRound(session, "p1", ["p3", "p4"], true);
  assert.equal(chefOf(events), "p2", "next chef on the next round");
  await playRound(session, "p2", ["p3", "p4", "p5"], true);
  await playRound(session, "p3", ["p3", "p4"], true);

  const gameOver = events.find((entry) => entry.event === "game_over");
  assert.deepEqual((gameOver?.payload as { winner: string; reason: string }).winner, "communist");
  for (const id of PLAYERS) {
    await session.confirmEndGame(id);
  }
  assert.ok(events.some((entry) => entry.event === "roles_revealed"));
  assert.equal(state.finished, "p4", "next game starts with the player after the last chef");
  assert.equal(bridge.disposed, true);
});

test("confidence votes are sent for active voters only, with voter_ids", async () => {
  const { session, bridge, active } = setup();
  await toProposing(session);
  await session.handleProposeTeam("p1", ["p3", "p4"]);
  active.delete("p5");
  for (const id of ["p1", "p2", "p3", "p4"]) {
    await session.handleConfidenceVote(id, "yes");
  }
  const call = bridge.calls.find((entry) => entry.command === "submit_confidence_votes");
  assert.deepEqual(call?.args.voter_ids, ["p1", "p2", "p3", "p4"]);
  assert.deepEqual(Object.keys(call?.args.votes as object), ["p1", "p2", "p3", "p4"]);
});

test("a tie reported by the engine is a rejection and returns to the same chef", async () => {
  const { session, bridge, events } = setup();
  bridge.override("submit_confidence_votes", () => ({ approved: false }));
  await toProposing(session);
  await session.handleProposeTeam("p1", ["p3", "p4"]);
  for (const id of PLAYERS) {
    await session.handleConfidenceVote(id, "yes");
  }
  for (const id of PLAYERS) {
    await session.confirmConfidenceResult(id);
  }
  const reveal = events.find((entry) => entry.event === "confidence_revealed");
  assert.equal((reveal?.payload as { approved: boolean }).approved, false);
  assert.equal(chefOf(events), "p1");
  assert.ok(!events.some((entry) => entry.event === "mission_phase"));
});

test("concurrent confirmations start the engine exactly once", async () => {
  const { session, bridge } = setup();
  await session.start();
  for (const id of PLAYERS) {
    await session.handleTableOrderTap(id);
  }
  const results = await Promise.allSettled([...PLAYERS, ...PLAYERS].map((id) => session.confirmTableOrder(id)));
  assert.equal(bridge.commands().filter((command) => command === "start_game").length, 1);
  assert.ok(results.some((result) => result.status === "rejected"), "late confirmations are rejected, not replayed");
});

test("an engine error while counting votes asks everybody to vote again", async () => {
  const { session, bridge, events } = setup();
  await toProposing(session);
  await session.handleProposeTeam("p1", ["p3", "p4"]);
  bridge.override("submit_confidence_votes", () => {
    throw new Error("boom");
  });
  for (const id of PLAYERS) {
    await session.handleConfidenceVote(id, "yes");
  }
  assert.equal((events.at(-2)?.payload as { code: string }).code, "vote_failed");
  assert.equal(events.at(-1)?.event, "confidence_phase");

  bridge.override("submit_confidence_votes", () => ({ approved: true }));
  for (const id of PLAYERS) {
    await session.handleConfidenceVote(id, "yes");
  }
  assert.ok(events.some((entry) => entry.event === "confidence_revealed"));
});

test("invalid actions are rejected explicitly", async () => {
  const { session } = setup();
  await toProposing(session);
  await assert.rejects(session.handleProposeTeam("p2", ["p3", "p4"]), /only the current chef/);
  await assert.rejects(session.handleProposeTeam("p1", ["p3"]), /exactly 2 members/);
  await assert.rejects(session.handleProposeTeam("p1", ["p3", "p3"]), /duplicate/);
  await assert.rejects(session.handleProposeTeam("p1", ["p3", "zz"]), /invalid player/);
  await assert.rejects(session.handleConfidenceVote("p1", "yes"), /action not allowed now/);

  await session.handleProposeTeam("p1", ["p1", "p3"]);
  await assert.rejects(session.handleProposeTeam("p1", ["p1", "p3"]), /action not allowed now/);
  for (const id of PLAYERS) {
    await session.handleConfidenceVote(id, "yes");
  }
  await assert.rejects(session.handleConfidenceVote("p1", "no"), /action not allowed now/);
  for (const id of PLAYERS) {
    await session.confirmConfidenceResult(id);
  }
  await assert.rejects(session.handleMissionVote("p3", "nazi"), /cannot sabotage/);
  await assert.rejects(session.handleMissionVote("p4", "communist"), /only team members/);
  await session.handleMissionVote("p1", "nazi");
  await assert.rejects(session.handleMissionVote("p1", "nazi"), /already submitted/);
});

test("a player going AFK after roles are dealt makes their faction forfeit", async () => {
  const { session, events, active, state } = setup();
  await toProposing(session);
  active.delete("p2");
  await session.handlePlayerAfk("p2");

  const gameOver = events.find((entry) => entry.event === "game_over");
  assert.deepEqual(gameOver?.payload, {
    winner: "communist",
    reason: "forfeit",
    forfeitedBy: "p2",
    scores: { nazi: 0, communist: 0 },
  });
  for (const id of PLAYERS.filter((id) => id !== "p2")) {
    await session.confirmEndGame(id);
  }
  assert.notEqual(state.finished, undefined, "the game ends without waiting for the AFK player");
});

test("a player going AFK before roles are dealt is excluded from the table quorum", async () => {
  const { session, bridge, active } = setup();
  await session.start();
  for (const id of ["p1", "p2", "p3", "p4"]) {
    await session.handleTableOrderTap(id);
    await session.confirmTableOrder(id).catch(() => undefined);
  }
  active.delete("p5");
  await session.handlePlayerAfk("p5");
  for (const id of ["p1", "p2", "p3", "p4"]) {
    await session.confirmTableOrder(id);
  }
  const start = bridge.calls.find((entry) => entry.command === "start_game");
  assert.deepEqual(start?.args.player_ids, ["p1", "p2", "p3", "p4", "p5"]);
});

test("resync restores proposal, own vote, histories and the last mission result", async () => {
  const { session, events } = setup();
  await toProposing(session);
  await playRound(session, "p1", ["p3", "p4"], false);
  await playRound(session, "p1", ["p1", "p3"], true, true);
  await playRound(session, "p2", ["p3", "p4", "p5"], true);
  await session.handleProposeTeam("p3", ["p3", "p4"]);
  await session.handleConfidenceVote("p4", "yes");

  await session.syncPlayer("p4");
  const resync = events.at(-1)?.payload as ResyncPayload;
  assert.equal(events.at(-1)?.target, "socket-p4");
  assert.equal(resync.phase, "confidence_vote");
  assert.deepEqual(resync.proposal, { chef: "p3", missionSize: 2, missionIndex: 3, team: ["p3", "p4"] });
  assert.equal(resync.hasVotedConfidence, true);
  assert.equal(resync.confidenceHistory.length, 3);
  assert.deepEqual(
    resync.missionHistory.map((entry) => entry.result),
    ["nazi", "communist"],
  );
  assert.deepEqual(resync.scores, { nazi: 1, communist: 1 });
  assert.equal(resync.role?.role, "communist");
  assert.equal(resync.role?.roleMap, undefined, "communists never receive the role map");
});

test("resync during mission_result reports the last mission winner, not the leading faction", async () => {
  const { session, events } = setup();
  await toProposing(session);
  await playRound(session, "p1", ["p3", "p4"], true);
  await session.handleProposeTeam("p2", ["p1", "p3", "p4"]);
  for (const id of PLAYERS) {
    await session.handleConfidenceVote(id, "yes");
  }
  for (const id of PLAYERS) {
    await session.confirmConfidenceResult(id);
  }
  await session.handleMissionVote("p1", "nazi");
  await session.handleMissionVote("p3", "communist");
  await session.handleMissionVote("p4", "communist");
  await session.syncPlayer("p1");
  const resync = events.at(-1)?.payload as ResyncPayload;
  assert.equal(resync.phase, "mission_result");
  assert.equal(resync.mission?.result, "nazi");
  assert.deepEqual(resync.mission?.scores, { nazi: 1, communist: 1 });
  assert.equal(Object.keys(resync.role?.roleMap ?? {}).length, 5, "nazis see every role");
});

test("an engine crash aborts the game and refuses further actions", async () => {
  const { session, events, state, bridge } = setup();
  await toProposing(session);
  session.handleEngineFailure("process exited");
  assert.equal(state.aborted, true);
  assert.equal(bridge.disposed, true);
  assert.ok(events.some((entry) => entry.event === "game_aborted"));
  await assert.rejects(session.handleProposeTeam("p1", ["p3", "p4"]), /no longer running/);
});

test("the previous game's next chef starts the new game", async () => {
  const { session, bridge } = setup({ nextChefId: "p4" });
  await toProposing(session);
  const start = bridge.calls.find((entry) => entry.command === "start_game");
  assert.equal(start?.args.chef_cursor, 3);
});

test("the engine start failing keeps the table order open", async () => {
  const { session, bridge, events } = setup();
  bridge.override("start_game", () => {
    throw new Error("engine down");
  });
  await session.start();
  for (const id of PLAYERS) {
    await session.handleTableOrderTap(id);
  }
  for (const id of PLAYERS) {
    await session.confirmTableOrder(id);
  }
  assert.equal(session.currentPhase, "table_order");
  assert.ok(events.some((entry) => (entry.payload as { code?: string })?.code === "engine_start_failed"));
});
