import assert from "node:assert/strict";
import test from "node:test";

import { RoomManager } from "./RoomManager";
import type { RoomManagerOptions } from "./RoomManager";
import { FakeBridge, createIoRecorder, tick } from "./test-utils/fakes";

const UIDS = ["uid-aaaaaaaaaaaaaaaa1", "uid-aaaaaaaaaaaaaaaa2", "uid-aaaaaaaaaaaaaaaa3", "uid-aaaaaaaaaaaaaaaa4", "uid-aaaaaaaaaaaaaaaa5"];

function setup(options: Partial<RoomManagerOptions> = {}) {
  const recorder = createIoRecorder();
  const bridges: FakeBridge[] = [];
  const manager = new RoomManager(recorder.io, {
    pythonPath: "python3",
    enginePath: "unused",
    afkTimeoutMs: 30,
    emptyRoomGraceMs: 60,
    revealPauseMs: 0,
    randomIndexProvider: () => 0,
    bridgeFactory: () => {
      const bridge = new FakeBridge({});
      bridges.push(bridge);
      return bridge;
    },
    ...options,
  });
  return { manager, bridges, ...recorder };
}

function fill(manager: RoomManager, code: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => manager.joinRoom(code, `s${index + 1}`, UIDS[index]).playerId);
}

test("joining an unknown room fails instead of creating it", () => {
  const { manager } = setup();
  assert.throws(() => manager.joinRoom("NOPE", "s1"), /room not found/);
  assert.equal(manager.roomCount, 0);
});

test("player ids are server-generated and a uid reclaims the same seat", () => {
  const { manager } = setup();
  const code = manager.createRoom({ code: "ROOM" });
  const first = manager.joinRoom(code, "s1", UIDS[0]);
  assert.match(first.playerId, /^p_[0-9a-f]{12}$/);

  const again = manager.joinRoom(code, "s2", UIDS[0]);
  assert.equal(again.playerId, first.playerId);
  assert.equal(again.reconnected, true);
  assert.equal(again.replacedSocketId, "s1");

  const stranger = manager.joinRoom(code, "s3");
  assert.notEqual(stranger.playerId, first.playerId);
});

test("the room payload never exposes reconnection secrets", () => {
  const { manager } = setup();
  const code = manager.createRoom();
  fill(manager, code, 2);
  const payload = JSON.stringify(manager.getRoomPayload(code));
  for (const uid of UIDS) {
    assert.ok(!payload.includes(uid));
  }
});

test("new players cannot join once the game has started", async () => {
  const { manager } = setup();
  const code = manager.createRoom({ code: "ROOM" });
  const [host] = fill(manager, code, 5);
  await manager.startGame(code, host as string);
  assert.throws(() => manager.joinRoom(code, "s9"), /already started/);
  assert.equal(manager.joinRoom(code, "s10", UIDS[2]).reconnected, true, "known players may reconnect");
});

test("only the host starts, and a non-host cannot change the ruleset first", async () => {
  const { manager } = setup();
  const code = manager.createRoom({ code: "ROOM", rulesetPreset: "PRESET_5J" });
  const [host, guest] = fill(manager, code, 5);
  await assert.rejects(manager.startGame(code, guest as string, { rulesetPreset: "PRESET_3J" }), /only the host/);
  await manager.startGame(code, host as string);
});

test("double start creates a single session", async () => {
  const { manager, bridges } = setup();
  const code = manager.createRoom();
  const [host] = fill(manager, code, 5);
  const results = await Promise.allSettled([manager.startGame(code, host as string), manager.startGame(code, host as string)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(bridges.length, 1);
});

test("placeholder presets and invalid rulesets are refused at creation", () => {
  const { manager } = setup();
  assert.throws(() => manager.createRoom({ rulesetPreset: "PRESET_7J" }), /not playable/);
  assert.throws(() => manager.createRoom({ rulesetPreset: "PRESET_99J" }), /unknown ruleset preset/);
  assert.throws(
    () =>
      manager.createRoom({
        ruleset: {
          player_count: 5,
          nazi_count: 2,
          communist_count: 3,
          mission_sizes: [2, 3, 2, 3],
          mission_count: 4,
          win_threshold: 3,
          info_mode: "full",
          experimental: false,
        },
      }),
    /draw would be possible/,
  );
});

test("a stale disconnect does not detach a reconnected player", async () => {
  const { manager } = setup();
  const code = manager.createRoom();
  const [player] = fill(manager, code, 1);
  manager.joinRoom(code, "s1-new", UIDS[0]);
  manager.handleDisconnect(code, player as string, "s1");
  await tick(50);
  const summary = manager.getRoomPayload(code).players[0];
  assert.equal(summary?.isConnected, true);
  assert.equal(summary?.isAfk, false);
});

test("a disconnected lobby player frees their seat after the AFK delay", async () => {
  const { manager, events } = setup();
  const code = manager.createRoom();
  const [host, guest] = fill(manager, code, 2);
  manager.handleDisconnect(code, guest as string, "s2");
  await tick(50);
  assert.deepEqual(
    manager.getRoomPayload(code).players.map((player) => player.playerId),
    [host],
  );
  assert.ok(events.some((entry) => entry.event === "player_left"));
});

test("the host role moves to a connected player", () => {
  const { manager } = setup();
  const code = manager.createRoom();
  const [host, guest] = fill(manager, code, 2);
  manager.handleDisconnect(code, host as string, "s1");
  assert.equal(manager.getRoomPayload(code).hostPlayerId, guest);
});

test("a room nobody is connected to is deleted after the grace period, killing its engine", async () => {
  const { manager, bridges } = setup({ afkTimeoutMs: 10_000 });
  const code = manager.createRoom();
  const players = fill(manager, code, 5);
  await manager.startGame(code, players[0] as string);
  players.forEach((id, index) => manager.handleDisconnect(code, id, `s${index + 1}`));
  await tick(100);
  assert.equal(manager.hasRoom(code), false);
  assert.equal(bridges[0]?.disposed, true);
});

test("the last player leaving deletes the room", () => {
  const { manager } = setup();
  const code = manager.createRoom();
  const [player] = fill(manager, code, 1);
  manager.leaveRoom(code, player as string);
  assert.equal(manager.hasRoom(code), false);
});

test("room creation is capped", () => {
  const { manager } = setup({ maxRooms: 2 });
  manager.createRoom();
  manager.createRoom();
  assert.throws(() => manager.createRoom(), /server is full/);
});

test("an engine crash sends the room back to the lobby", async () => {
  const { manager } = setup();
  const code = manager.createRoom();
  const players = fill(manager, code, 5);
  const session = await manager.startGame(code, players[0] as string);
  session.handleEngineFailure("crash");
  assert.equal(manager.getStatus(code), "waiting");
  assert.equal(manager.getSession(code), undefined);
  await manager.startGame(code, players[0] as string);
});
