import { describe, expect, it, vi } from "vitest";

import { normalizeRoomCode, parseConfidenceVotes, parseRoom, ROOM_CODE_PATTERN, translateError, uiPhaseFromServer } from "./protocol";

describe("protocol", () => {
  it("parses the public room payload", () => {
    const room = parseRoom({
      code: "ABC",
      hostPlayerId: "p2",
      targetPlayerCount: 5,
      status: "waiting",
      players: [{ playerId: "p1", pseudo: "Rosa", isHost: false, isAfk: false, isConnected: true }, { nope: true }],
    });
    expect(room).toEqual({
      code: "ABC",
      hostId: "p2",
      targetPlayerCount: 5,
      status: "waiting",
      chatEnabled: null,
      minPlayers: null,
      isPublic: null,
      pace: null,
      revealRoles: null,
      players: [{ id: "p1", pseudo: "Rosa", isHost: false, isAfk: false, isConnected: true, absence: null }],
    });
    expect(parseRoom({ status: "hacked" }).status).toBeNull();
  });

  it("turns the server's relative absence durations into local times", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const [player] = parseRoom({ players: [{ playerId: "p1", absence: { awayForMs: 20_000, promptAfterMs: 30_000, votes: ["p2", 3], needed: 2 } }] }).players;
    expect(player?.absence).toEqual({ since: 980_000, promptAt: 1_010_000, votes: ["p2"], needed: 2 });
    vi.useRealTimers();
  });

  it("parses confidence votes and ignores garbage", () => {
    expect(parseConfidenceVotes([{ playerId: "a", vote: "yes" }, { playerId: "b", vote: "maybe" }, "x"])).toEqual({ a: "yes" });
  });

  it("maps server phases to screens", () => {
    expect(uiPhaseFromServer("proposing")).toBe("mission_proposal");
    expect(uiPhaseFromServer("mission_vote")).toBe("mission_execution");
    expect(uiPhaseFromServer("??")).toBeNull();
  });

  it("normalizes and validates room codes like the server", () => {
    expect(normalizeRoomCode(" ma room ")).toBe("MA-ROOM");
    expect(ROOM_CODE_PATTERN.test("MA-ROOM")).toBe(true);
    expect(ROOM_CODE_PATTERN.test("A!")).toBe(false);
  });

  it("translates known server errors", () => {
    expect(translateError("room not found")).toMatch(/n'existe pas/);
    expect(translateError("something else")).toBe("something else");
  });
});
