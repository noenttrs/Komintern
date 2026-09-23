import assert from "node:assert/strict";
import test from "node:test";

import { GameSession } from "./GameSession";
import type { ConfidenceVote, Faction } from "./types";

class FakeBridge {
  public readonly calls: Array<{ command: string; args: Record<string, unknown> }> = [];
  private readonly responses = new Map<string, unknown>();

  public setResponse(command: string, response: unknown): void {
    this.responses.set(command, response);
  }

  public async send(command: string, args: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ command, args });
    if (this.responses.has(command)) {
      return this.responses.get(command);
    }
    return { ok: true };
  }

  public kill(): void {
    return;
  }
}

function createIoRecorder(): { io: unknown; events: Array<{ room: string; event: string; payload: unknown }> } {
  const events: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          events.push({ room, event, payload });
        },
      };
    },
  };

  return { io, events };
}

test("GameSession resolves confidence vote quorum using active players only", async () => {
  const bridge = new FakeBridge();
  bridge.setResponse("submit_confidence_votes", {
    phase: "mission",
    chef_id: "p1",
    proposed_team: [],
    confidence_votes: {},
    mission_votes: [],
  });

  const { io, events } = createIoRecorder();
  const session = new GameSession(
    "room-1",
    ["p1", "p2", "p3"],
    0,
    new Map(),
    io as never,
    {
      pythonPath: "",
      enginePath: "",
      ruleset: {
        engineArgs: { ruleset_preset: "PRESET_5J" },
        playerCount: 5,
        missionSizes: [2, 3, 2, 3, 3],
        missionCount: 5,
      },
      hostPlayerId: "p1",
      persistCursor: () => undefined,
      onRevealComplete: () => undefined,
      onGameOver: () => undefined,
      getActivePlayerIds: () => ["p1", "p2"],
      bridge,
    },
  );

  (session as never as { phase: string; confidenceVotes: Map<string, ConfidenceVote>; lastConfidenceResult: unknown }).phase = "voting";
  (session as never as { confidenceVotes: Map<string, ConfidenceVote> }).confidenceVotes = new Map([
    ["p1", "yes"],
    ["p2", "no"],
  ]);

  await session.handleRosterChange();

  assert.equal(bridge.calls[0]?.command, "submit_confidence_votes");
  const confidenceReveal = events.find((entry) => entry.event === "confidence_revealed");
  assert.ok(confidenceReveal);
  assert.equal((confidenceReveal?.payload as { result: ConfidenceVote }).result, "yes");
});

test("GameSession emits resync payload on reconnect", async () => {
  const bridge = new FakeBridge();
  bridge.setResponse("get_player_view", { p1: "nazi", p2: "communist" });

  const { io, events } = createIoRecorder();
  const session = new GameSession(
    "room-2",
    ["p1", "p2"],
    0,
    new Map([["p1", "socket-1"]]),
    io as never,
    {
      pythonPath: "",
      enginePath: "",
      ruleset: {
        engineArgs: { ruleset_preset: "PRESET_5J" },
        playerCount: 5,
        missionSizes: [2, 3, 2, 3, 3],
        missionCount: 5,
      },
      hostPlayerId: "p1",
      persistCursor: () => undefined,
      onRevealComplete: () => undefined,
      onGameOver: () => undefined,
      bridge,
    },
  );

  await session.syncPlayer("p1");

  const resyncEvent = events.find((entry) => entry.event === "resync");
  assert.ok(resyncEvent);
  assert.equal((resyncEvent?.payload as { room: { code: string } }).room.code, "room-2");
});

test("GameSession keeps mission nazi vote count in reveal and resync payloads", async () => {
  const bridge = new FakeBridge();
  bridge.setResponse("submit_mission_votes", {
    winner: "nazi",
    votes: ["NAZI", "COMMUNIST"],
  });
  bridge.setResponse("get_player_view", { p1: "nazi", p2: "communist", p3: "communist" });

  const { io, events } = createIoRecorder();
  const session = new GameSession(
    "room-3",
    ["p1", "p2", "p3"],
    0,
    new Map([["p1", "socket-1"]]),
    io as never,
    {
      pythonPath: "",
      enginePath: "",
      ruleset: {
        engineArgs: { ruleset_preset: "PRESET_5J" },
        playerCount: 5,
        missionSizes: [2, 3, 2, 3, 3],
        missionCount: 5,
      },
      hostPlayerId: "p1",
      persistCursor: () => undefined,
      onRevealComplete: () => undefined,
      onGameOver: () => undefined,
      bridge,
    },
  );

  (session as never as {
    phase: string;
    proposedTeam: string[];
    roleMap: Record<string, string>;
    missionVotes: Map<string, string>;
  }).phase = "mission";
  (session as never as { proposedTeam: string[] }).proposedTeam = ["p1", "p2"];
  (session as never as { roleMap: Record<string, string> }).roleMap = {
    p1: "nazi",
    p2: "communist",
    p3: "communist",
  };

  await session.handleMissionVote("p1", "nazi");
  await session.handleMissionVote("p2", "communist");

  const revealedEvent = events.find((entry) => entry.event === "mission_revealed");
  assert.ok(revealedEvent);
  assert.equal((revealedEvent?.payload as { naziVotes: number }).naziVotes, 1);

  await session.syncPlayer("p1");

  const resyncEvent = [...events].reverse().find((entry) => entry.event === "resync");
  assert.ok(resyncEvent);
  const mission = (resyncEvent?.payload as { mission: { team?: string[]; naziVotes?: number } | null }).mission;
  assert.ok(mission);
  assert.deepEqual(mission.team, ["p1", "p2"]);
  assert.equal(mission.naziVotes, 1);
});

test("GameSession starts python engine with rotated table order", async () => {
  const bridge = new FakeBridge();
  bridge.setResponse("get_player_view", { p1: "nazi", p2: "communist", p3: "communist" });

  const { io } = createIoRecorder();
  const session = new GameSession(
    "room-4",
    ["p1", "p2", "p3"],
    0,
    new Map([[
      "p1",
      "socket-1",
    ]]),
    io as never,
    {
      pythonPath: "",
      enginePath: "",
      ruleset: {
        engineArgs: { ruleset_preset: "PRESET_5J" },
        playerCount: 5,
        missionSizes: [2, 3, 2, 3, 3],
        missionCount: 5,
      },
      hostPlayerId: "p1",
      persistCursor: () => undefined,
      onRevealComplete: () => undefined,
      onGameOver: () => undefined,
      randomIndexProvider: () => 1,
      bridge,
    },
  );

  await session.start();

  (session as never as { tableOrder: string[] }).tableOrder = ["p1", "p2", "p3"];
  await session.confirmTableOrder("p1");
  await session.confirmTableOrder("p2");
  await session.confirmTableOrder("p3");

  const startCall = bridge.calls.find((entry) => entry.command === "start_game");
  assert.ok(startCall);
  assert.deepEqual(startCall?.args.player_ids, ["p2", "p3", "p1"]);
  assert.equal(startCall?.args.chef_cursor, 0);
  assert.equal(bridge.calls.some((entry) => entry.command === "set_turn_order"), false);
});
