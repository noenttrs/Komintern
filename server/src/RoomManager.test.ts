import assert from "node:assert/strict";
import test from "node:test";

import { DuelSession } from "./DuelSession";
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
  await assert.rejects(manager.startGame(code, guest as string, { rulesetPreset: "PRESET_2J" }), /only the host/);
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
  assert.throws(() => manager.createRoom({ rulesetPreset: "PRESET_2J" }), /unknown ruleset preset/);
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

test("a room created for in-person play refuses chat messages", () => {
  const { manager } = setup();
  const code = manager.createRoom({ chatEnabled: false });
  const [player] = fill(manager, code, 1);
  assert.equal(manager.getRoomPayload(code).chatEnabled, false);
  assert.throws(() => manager.addChatMessage(code, player as string, "salut", "salut", false), /chat is disabled/);
  const remote = manager.createRoom();
  assert.equal(manager.getRoomPayload(remote).chatEnabled, true);
});

test("free rules rooms accept 2 (duel) to 11 players, preset rooms an exact count", async () => {
  const { manager } = setup();
  const free = manager.createRoom();
  assert.deepEqual([manager.getRoomPayload(free).minPlayers, manager.getRoomPayload(free).maxPlayers], [2, 11]);
  const players = Array.from({ length: 11 }, (_, index) => manager.joinRoom(free, `f${index}`).playerId);
  assert.throws(() => manager.joinRoom(free, "f-extra"), /room is full/);
  await manager.startGame(free, players[0] as string);

  const seven = manager.createRoom({ rulesetPreset: "PRESET_7J" });
  assert.deepEqual([manager.getRoomPayload(seven).minPlayers, manager.getRoomPayload(seven).maxPlayers], [7, 7]);
});

test("the host can kick, hand over the host role and switch the chat, only in the lobby", async () => {
  const { manager, events } = setup();
  const code = manager.createRoom({ chatEnabled: false });
  const [host, guest, other] = fill(manager, code, 3) as [string, string, string];
  assert.throws(() => manager.kickPlayer(code, guest, other), /only the host/);
  assert.equal(manager.kickPlayer(code, host, guest), "s2");
  assert.ok(events.some((entry) => entry.event === "player_left"));
  assert.throws(() => manager.joinRoom(code, "s2-again", UIDS[1]), /removed from this room/);

  manager.setChatEnabled(code, host, true);
  assert.equal(manager.getRoomPayload(code).chatEnabled, true);
  manager.transferHost(code, host, other);
  assert.equal(manager.getRoomPayload(code).hostPlayerId, other);
  assert.throws(() => manager.setChatEnabled(code, host, false), /only the host/);

  fill(manager, code, 0);
  for (let index = 0; index < 3; index += 1) manager.joinRoom(code, `x${index}`);
  await manager.startGame(code, other);
  assert.throws(() => manager.transferHost(code, other, host), /only possible in the waiting room/);
});

test("a decided game is recorded right away, even if everybody quits from the end screen", async () => {
  const recorded: string[] = [];
  const { manager } = setup({ hooks: { onGameRecorded: (game) => void recorded.push(game.outcome) } });
  const code = manager.createRoom();
  const players = fill(manager, code, 5);
  const session = await manager.startGame(code, players[0] as string);
  for (const id of players) await session.handleTableOrderTap(id);
  for (const id of players) await session.confirmTableOrder(id);
  for (const id of players) await session.confirmRoleReveal(id);
  // Abandon d'un joueur : le vainqueur est connu immédiatement.
  manager.leaveRoom(code, players[1] as string);
  await tick(20);
  assert.deepEqual(recorded, ["finished"]);
  for (const id of players) manager.leaveRoom(code, id);
  await tick(20);
  assert.deepEqual(recorded, ["finished"], "recorded only once");
});

test("a room deleted in the middle of a game records it as aborted", async () => {
  const recorded: string[] = [];
  const { manager } = setup({ afkTimeoutMs: 10_000, hooks: { onGameRecorded: (game) => void recorded.push(game.outcome) } });
  const code = manager.createRoom();
  const players = fill(manager, code, 5);
  await manager.startGame(code, players[0] as string);
  players.forEach((id, index) => manager.handleDisconnect(code, id, `s${index + 1}`));
  await tick(100);
  assert.deepEqual(recorded, ["aborted"]);
});

test("public rooms are listed, reserved to accounts, and always have chat", () => {
  const { manager } = setup();
  const code = manager.createRoom({ isPublic: true, chatEnabled: false });
  assert.equal(manager.getRoomPayload(code).chatEnabled, true);
  assert.deepEqual(manager.listPublicRooms(), [], "an empty room is not listed");
  const host = manager.joinRoom(code, "s1", UIDS[0], "u_host").playerId;
  assert.throws(() => manager.joinRoom(code, "s2", UIDS[1]), /log in to join public rooms/);
  manager.joinRoom(code, "s3", UIDS[2], "u_guest");
  assert.deepEqual(manager.listPublicRooms().map((room) => [room.code, room.players]), [[code, 2]]);
  assert.throws(() => manager.setChatEnabled(code, host, false), /always have chat/);
  manager.setPublic(code, host, false);
  assert.deepEqual(manager.listPublicRooms(), []);

  const privateRoom = manager.createRoom();
  const privateHost = manager.joinRoom(privateRoom, "p1", UIDS[3], "u_other").playerId;
  manager.joinRoom(privateRoom, "p2", UIDS[4]);
  assert.throws(() => manager.setPublic(privateRoom, privateHost, true), /needs an account/);
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

// ---------------------------------------------------------------- absences en partie

type Notified = { playerId: string; kind: string; detail?: unknown };

async function gameWithRoles(options: Partial<RoomManagerOptions> = {}) {
  const notified: Notified[] = [];
  const context = setup({
    afkTimeoutMs: 80,
    absenceWarningMs: 40,
    absenceHoldMs: 200,
    ...options,
    hooks: { onNotify: (_code, playerId, notification) => void notified.push({ playerId, kind: notification.kind, detail: notification }) },
  });
  const code = context.manager.createRoom();
  const players = fill(context.manager, code, 5);
  const session = await context.manager.startGame(code, players[0] as string);
  return { ...context, code, players, session, notified };
}

async function revealRoles(session: Awaited<ReturnType<typeof gameWithRoles>>["session"], players: string[]) {
  for (const id of players) await session.handleTableOrderTap(id);
  for (const id of players) await session.confirmTableOrder(id);
  for (const id of players) await session.confirmRoleReveal(id);
}

test("an absent player gets a warning before their side forfeits", async () => {
  const { manager, code, players, session, notified } = await gameWithRoles();
  await revealRoles(session, players);
  const gone = players[4] as string;
  manager.handleDisconnect(code, gone, "s5");
  const absence = manager.getRoomPayload(code).players.find((player) => player.playerId === gone)?.absence;
  assert.ok(absence !== null && absence !== undefined && absence.kickInMs > 0 && absence.heldBy === null);
  await tick(60);
  assert.deepEqual(notified.map((entry) => [entry.playerId, entry.kind]), [[gone, "absence_warning"]]);
  assert.equal(manager.getRoomPayload(code).players.find((player) => player.playerId === gone)?.isAfk, false);
  await tick(60);
  assert.equal(manager.getRoomPayload(code).players.find((player) => player.playerId === gone)?.isAfk, true);
  assert.equal(manager.getRoomPayload(code).players.find((player) => player.playerId === gone)?.absence, null);
});

test("the others can wait for an absent player, then stop waiting", async () => {
  const { manager, code, players, session, notified } = await gameWithRoles();
  await revealRoles(session, players);
  const [first, , , , gone] = players as [string, string, string, string, string];
  assert.throws(() => manager.holdForPlayer(code, first, players[1] as string), /not away/);
  manager.handleDisconnect(code, gone, "s5");
  assert.throws(() => manager.holdForPlayer(code, gone, gone), /unknown player/, "the absent player cannot hold for themselves");
  manager.holdForPlayer(code, first, gone);
  assert.equal(manager.getRoomPayload(code).players.find((player) => player.playerId === gone)?.absence?.heldBy, "Joueur 1");
  assert.deepEqual(notified.map((entry) => entry.kind), ["absence_hold"]);
  await tick(120);
  assert.equal(manager.getRoomPayload(code).players.find((player) => player.playerId === gone)?.isAfk, false, "still waited for");

  manager.releaseHold(code, first, gone);
  await tick(10);
  assert.deepEqual(notified.map((entry) => entry.kind), ["absence_hold", "absence_warning"], "warned right away");
  await tick(60);
  assert.equal(manager.getRoomPayload(code).players.find((player) => player.playerId === gone)?.isAfk, true);
});

test("coming back cancels the countdown", async () => {
  const { manager, code, players, session, notified } = await gameWithRoles();
  await revealRoles(session, players);
  manager.handleDisconnect(code, players[4] as string, "s5");
  manager.joinRoom(code, "s5-back", UIDS[4]);
  await tick(120);
  assert.deepEqual(notified, []);
  assert.equal(manager.getRoomPayload(code).players[4]?.isAfk, false);
  assert.equal(manager.getRoomPayload(code).players[4]?.absence, null);
});

test("a player absent before the roles are dealt cancels the game instead of blocking it", async () => {
  const { manager, code, players, events } = await gameWithRoles({ afkTimeoutMs: 20, absenceWarningMs: 10 });
  manager.handleDisconnect(code, players[4] as string, "s5");
  await tick(60);
  assert.equal(manager.getStatus(code), "waiting");
  assert.equal(manager.getSession(code), undefined);
  assert.deepEqual(manager.getRoomPayload(code).players.map((player) => player.playerId), players.slice(0, 4));
  assert.ok(events.some((entry) => entry.event === "game_aborted"));
});

test("a finished room lets a returning or new player in, between two games", async () => {
  const { manager, code, players, session } = await gameWithRoles();
  await revealRoles(session, players);
  manager.leaveRoom(code, players[4] as string);
  await tick(20);
  for (const id of players.slice(0, 4)) await session.confirmEndGame(id);
  assert.equal(manager.getStatus(code), "finished");
  const back = manager.joinRoom(code, "s5-back", UIDS[4]);
  assert.equal(back.reconnected, false, "the forfeited seat was freed: a fresh seat");
  assert.equal(manager.getRoomPayload(code).players.length, 5);
});

test("turn notifications only go to players who are not looking at the game", async () => {
  const { manager, code, players, session, notified } = await gameWithRoles();
  const subscription = { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" }, lang: "fr" as const };
  for (const id of players) manager.setPushSubscription(code, id, subscription);
  const [looking, ...away] = players as [string, ...string[]];
  for (const id of away) manager.setVisibility(code, id, false);
  await revealRoles(session, players);
  const chef = (session as unknown as { round: { chefId: string } }).round.chefId;
  const expected = chef === looking ? [] : [[chef, "proposal"]];
  assert.deepEqual(notified.map((entry) => [entry.playerId, entry.kind]), expected, "only the chef, and only if their screen is hidden");
});

// ---------------------------------------------------------------- duel à 2 joueurs

function duelBridge(roles: Record<string, "nazi" | "communist">, winners: (ids: string[]) => string[]) {
  const bridge = new FakeBridge({});
  let ids: string[] = [];
  bridge.override("duel_start", (args) => {
    ids = args.player_ids as string[];
    return { roles: Object.fromEntries(ids.map((id, index) => [id, Object.values(roles)[index]])) };
  });
  bridge.override("duel_resolve", () => ({ winners: winners(ids), reason: "nazi_accepted" }));
  return bridge;
}

test("two players in a free room play a duel: own role only, secret votes, per-player result", async () => {
  const recorded: Array<{ duel: unknown; outcome: string }> = [];
  const { manager, events } = setup({
    bridgeFactory: () => duelBridge({ a: "communist", b: "nazi" }, (ids) => [ids[1] as string]),
    hooks: { onGameRecorded: (game) => void recorded.push({ duel: game.summary.duel, outcome: game.outcome }) },
  });
  const code = manager.createRoom();
  const [first, second] = fill(manager, code, 2) as [string, string];
  assert.equal(manager.getRoomPayload(code).minPlayers, 2);
  const session = await manager.startAnyGame(code, first);
  assert.equal(session instanceof DuelSession, true);
  const duel = session as DuelSession;

  const roles = events.filter((entry) => entry.event === "role_assigned").map((entry) => entry.payload as Record<string, unknown>);
  assert.equal(roles.length, 2);
  assert.ok(roles.every((payload) => payload.roleMap === undefined), "nobody sees the other's role, not even the Nazi");

  await assert.rejects(duel.handleDuelVote(first, "trust"), /not allowed/, "no vote before both saw their role");
  await duel.confirmRoleReveal(first);
  await duel.confirmRoleReveal(second);
  assert.ok(events.some((entry) => entry.event === "duel_phase"));
  await duel.handleDuelVote(first, "trust");
  await assert.rejects(duel.handleDuelVote(first, "accuse"), /already voted/);
  const progress = events.filter((entry) => entry.event === "duel_progress").at(-1)?.payload as { votedPlayerIds: string[] };
  assert.deepEqual(progress, { votedPlayerIds: [first] }, "who voted, never what");
  await duel.handleDuelVote(second, "trust");

  const result = events.find((entry) => entry.event === "duel_result")?.payload as { winners: string[]; votes: Record<string, string>; roleMap: Record<string, string> };
  assert.deepEqual(result.winners, [second]);
  assert.deepEqual(result.votes, { [first]: "trust", [second]: "trust" });
  assert.deepEqual(result.roleMap, { [first]: "communist", [second]: "nazi" });
  assert.equal(manager.getStatus(code), "finished");
  assert.deepEqual(recorded, [{ duel: { winners: [second], reason: "nazi_accepted", votes: { [first]: "trust", [second]: "trust" } }, outcome: "finished" }]);

  await manager.requestReplay(code, first);
  await manager.requestReplay(code, second);
  assert.equal(manager.getSession(code) instanceof DuelSession, true, "replay starts a new duel");
});

test("a duel player who stays away loses the duel", async () => {
  const { manager, events } = setup({ afkTimeoutMs: 20, absenceWarningMs: 10, bridgeFactory: () => duelBridge({ a: "nazi", b: "nazi" }, () => []) });
  const code = manager.createRoom();
  const [first, second] = fill(manager, code, 2) as [string, string];
  await manager.startAnyGame(code, first);
  manager.handleDisconnect(code, second, "s2");
  await tick(60);
  const result = events.find((entry) => entry.event === "duel_result")?.payload as { winners: string[]; reason: string; forfeitedBy: string };
  assert.deepEqual([result.winners, result.reason, result.forfeitedBy], [[first], "forfeit", second]);
});

// ---------------------------------------------------------------- sécurité

test("a socket holds a single seat: joining the same room again reuses it", () => {
  const { manager } = setup();
  const code = manager.createRoom();
  const first = manager.joinRoom(code, "s1");
  const again = manager.joinRoom(code, "s1", "uid-another-secret-00001");
  assert.equal(again.playerId, first.playerId);
  assert.equal(manager.getRoomPayload(code).players.length, 1);
});

test("generated room codes are long and unambiguous", () => {
  const { manager } = setup();
  for (let index = 0; index < 20; index += 1) {
    assert.match(manager.createRoom(), /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
  }
});

test("pseudos are unique within a room", () => {
  const { manager } = setup();
  const code = manager.createRoom();
  const [first, second] = fill(manager, code, 2) as [string, string];
  manager.setPseudo(code, first, "Rosa");
  manager.setPseudo(code, second, "rosa");
  assert.deepEqual(manager.getRoomPayload(code).players.map((player) => player.pseudo), ["Rosa", "rosa 2"]);
});

test("waiting for an absent player is capped: no endless stall", async () => {
  const { manager, code, players, session } = await gameWithRoles({ absenceHoldMs: 1_000 });
  await revealRoles(session, players);
  const [first, , , , gone] = players as [string, string, string, string, string];
  manager.handleDisconnect(code, gone, "s5");
  manager.holdForPlayer(code, first, gone);
  assert.throws(() => manager.holdForPlayer(code, first, gone), /already waiting/);
  for (let hold = 1; hold < 3; hold += 1) {
    manager.releaseHold(code, first, gone);
    manager.holdForPlayer(code, first, gone);
  }
  manager.releaseHold(code, first, gone);
  assert.throws(() => manager.holdForPlayer(code, first, gone), /cannot wait any longer/);
});
