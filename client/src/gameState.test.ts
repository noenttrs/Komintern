import { describe, expect, it } from "vitest";

import { gameReducer, initialGameState } from "./gameState";
import type { GameAction, GameState } from "./gameState";

const room = (overrides: Record<string, unknown> = {}) => ({
  code: "ROOM",
  hostPlayerId: "p1",
  targetPlayerCount: 5,
  status: "waiting",
  players: ["p1", "p2", "p3"].map((playerId) => ({ playerId, pseudo: playerId, isHost: playerId === "p1", isAfk: false, isConnected: true })),
  ...overrides,
});

function run(state: GameState, ...events: Array<[string, unknown]>): GameState {
  return events.reduce<GameState>((current, [event, payload]) => gameReducer(current, { type: "server", event, payload } as GameAction), state);
}

const joined = () => run(initialGameState("Rosa", ""), ["room_joined", { playerId: "p2", ...room() }]);

describe("gameReducer", () => {
  it("takes its own id only from room_joined", () => {
    const state = joined();
    expect(state.myId).toBe("p2");
    expect(state.phase).toBe("waiting_room");
    expect(state.roomCode).toBe("ROOM");
  });

  it("never changes its own id when others join or leave (audit K2)", () => {
    const state = run(joined(), ["player_left", { playerId: "p3" }], ["room_updated", room({ hostPlayerId: "p2" })]);
    expect(state.myId).toBe("p2");
    expect(state.hostId).toBe("p2");
  });

  it("uses the mission winner computed by the server (audit K3)", () => {
    const state = run(
      joined(),
      ["game_started", {}],
      ["proposal_phase", { chef: "p1", missionSize: 2, missionIndex: 1, team: [] }],
      ["mission_revealed", { missionIndex: 1, team: ["p1", "p2"], naziVotes: 1, result: "communist", scores: { nazi: 0, communist: 1 } }],
    );
    expect(state.mission.result).toBe("communist");
    expect(state.missionHistory).toEqual([{ missionIndex: 1, team: ["p1", "p2"], naziVoteCount: 1, result: "communist" }]);
    expect(state.score).toEqual({ nazi: 0, communist: 1 });
  });

  it("records confidence results with the proposed team", () => {
    const state = run(
      joined(),
      ["game_started", {}],
      ["proposal_phase", { chef: "p1", missionSize: 2, missionIndex: 1, team: [] }],
      ["proposal_phase", { chef: "p1", missionSize: 2, missionIndex: 1, team: ["p1", "p3"] }],
      ["confidence_phase", { chef: "p1", team: ["p1", "p3"] }],
      ["confidence_revealed", { votes: [{ playerId: "p1", vote: "yes" }, { playerId: "p2", vote: "no" }], approved: false }],
    );
    expect(state.phase).toBe("confidence_result");
    expect(state.confidenceHistory[0]).toMatchObject({ missionIndex: 1, chef: "p1", team: ["p1", "p3"], approved: false });
  });

  it("restores the full game from a resync (audit K4)", () => {
    const state = run(initialGameState("Rosa", "ROOM"), ["room_joined", { playerId: "p2", ...room({ status: "playing" }) }], [
      "resync",
      {
        room: room({ status: "playing" }),
        phase: "confidence_vote",
        missionCount: 5,
        scores: { nazi: 1, communist: 0 },
        tableOrder: ["p1", "p2", "p3"],
        tableOrderConfirmed: ["p1", "p2", "p3"],
        turnOrder: ["p1", "p2", "p3"],
        role: { role: "nazi", roleMap: { p1: "nazi", p2: "nazi", p3: "communist" } },
        proposal: { chef: "p1", missionSize: 2, missionIndex: 2, team: ["p1", "p3"] },
        confidence: null,
        hasVotedConfidence: true,
        hasVotedMission: false,
        hasConfirmed: false,
        mission: null,
        missionProgress: null,
        confidenceHistory: [{ missionIndex: 1, chef: "p3", team: ["p2", "p3"], votes: [{ playerId: "p1", vote: "yes" }], approved: true }],
        missionHistory: [{ missionIndex: 1, team: ["p2", "p3"], naziVotes: 1, result: "nazi" }],
        gameOver: null,
      },
    ]);
    expect(state.phase).toBe("confidence_vote");
    expect(state.proposal.proposedTeam).toEqual(["p1", "p3"]);
    expect(state.myProgress.votedConfidence).toBe(true);
    expect(state.role.faction).toBe("nazi");
    expect(state.missionHistory).toHaveLength(1);
    expect(state.confidenceHistory).toHaveLength(1);
    expect(state.score).toEqual({ nazi: 1, communist: 0 });
    expect(state.gameMeta.missionCount).toBe(5);
  });

  it("leaves the game screens when the room goes back to the lobby", () => {
    const inGame = run(joined(), ["game_started", {}]);
    expect(inGame.phase).toBe("table_order");
    const back = run(inGame, ["room_updated", room({ status: "waiting" })]);
    expect(back.phase).toBe("waiting_room");
    expect(run(inGame, ["game_aborted", {}]).phase).toBe("waiting_room");
  });

  it("stores translated errors with a fresh id each time", () => {
    const first = run(joined(), ["error", { code: "invalid_join_room", message: "room not found" }]);
    const second = run(first, ["error", { code: "invalid_join_room", message: "room not found" }]);
    expect(first.error?.message).toMatch(/n'existe pas/);
    expect(second.error?.id).not.toBe(first.error?.id);
  });

  it("forgets the room completely when leaving", () => {
    const state = gameReducer(run(joined(), ["game_started", {}]), { type: "left_room" });
    expect(state).toMatchObject({ phase: "landing", roomCode: "", myId: null, players: [] });
  });
});
