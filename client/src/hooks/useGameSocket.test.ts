import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSocket } from "../test/fakeSocket";

const fake = vi.hoisted(() => ({ socket: null as unknown as FakeSocket }));
vi.mock("../socket", async () => {
  const { FakeSocket: Socket } = await import("../test/fakeSocket");
  fake.socket = new Socket();
  return { socket: fake.socket };
});

import { useGameSocket } from "./useGameSocket";

const roomPayload = { code: "ROOM", hostPlayerId: "p1", targetPlayerCount: 5, status: "playing", players: [{ playerId: "p1", pseudo: "Rosa" }] };

describe("useGameSocket", () => {
  beforeEach(() => {
    fake.socket.reset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("komintern.pseudo", "Rosa");
  });

  it("uses a per-tab secret uid and stores the room only once joined", () => {
    const { result } = renderHook(() => useGameSocket());
    act(() => result.current.joinRoom("room"));
    const join = fake.socket.emitted.find((entry) => entry.event === "join_room");
    expect(join?.payload).toMatchObject({ code: "ROOM", pseudo: "Rosa" });
    const uid = (join?.payload as { playerUid: string }).playerUid;
    expect(uid).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(window.sessionStorage.getItem("komintern.player_uid")).toBe(uid);
    expect(window.sessionStorage.getItem("komintern.room_code")).toBeNull();
    expect(result.current.phase).toBe("landing");

    act(() => fake.socket.serverEmit("room_joined", { playerId: "p1", ...roomPayload, status: "waiting" }));
    expect(window.sessionStorage.getItem("komintern.room_code")).toBe("ROOM");
    expect(result.current.phase).toBe("waiting_room");
  });

  it("queues game actions until the seat is reclaimed after a reconnection (audit K5)", () => {
    window.sessionStorage.setItem("komintern.room_code", "ROOM");
    const { result } = renderHook(() => useGameSocket());
    // Montage : une seule demande de rejoin (audit K11).
    expect(fake.socket.events().filter((event) => event === "join_room")).toHaveLength(1);
    act(() => fake.socket.serverEmit("room_joined", { playerId: "p1", ...roomPayload }));

    act(() => fake.socket.drop());
    act(() => result.current.sendConfidenceVote("yes"));
    expect(fake.socket.events()).not.toContain("confidence_vote");

    act(() => {
      fake.socket.connect();
    });
    const afterReconnect = fake.socket.events();
    expect(afterReconnect.at(-1)).toBe("join_room");
    expect(afterReconnect).not.toContain("confidence_vote");

    act(() => fake.socket.serverEmit("room_joined", { playerId: "p1", ...roomPayload }));
    expect(fake.socket.emitted.at(-1)).toEqual({ event: "confidence_vote", payload: { vote: "yes" } });
  });

  it("forgets a stored room that no longer exists", () => {
    window.sessionStorage.setItem("komintern.room_code", "GONE");
    const { result } = renderHook(() => useGameSocket());
    act(() => fake.socket.serverEmit("error", { code: "invalid_join_room", message: "room not found" }));
    expect(window.sessionStorage.getItem("komintern.room_code")).toBeNull();
    expect(result.current.phase).toBe("landing");
    expect(result.current.error?.message).toMatch(/n'existe pas/);
  });

  it("quitting after a game resets everything (audit K8)", () => {
    window.sessionStorage.setItem("komintern.room_code", "ROOM");
    const { result } = renderHook(() => useGameSocket());
    act(() => fake.socket.serverEmit("room_joined", { playerId: "p1", ...roomPayload, status: "finished" }));
    act(() => result.current.sendReplayChoice("quit"));
    expect(fake.socket.emitted.at(-1)).toEqual({ event: "replay_choice", payload: { choice: "quit" } });
    expect(result.current.phase).toBe("landing");
    expect(result.current.roomCode).toBe("");
    expect(window.sessionStorage.getItem("komintern.room_code")).toBeNull();
  });

  it("rejects invalid room codes before contacting the server", () => {
    const { result } = renderHook(() => useGameSocket());
    act(() => result.current.createRoom({ roomName: "!!" }));
    expect(fake.socket.events()).not.toContain("create_room");
    expect(result.current.error).not.toBeNull();
  });
});
