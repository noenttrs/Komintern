import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, test } from "node:test";

import { io as connect } from "socket.io-client";
import type { Socket } from "socket.io-client";

import { createKominternApp } from "./app";
import type { KominternApp } from "./app";

// Bout en bout : vrai serveur Socket.IO, vrai moteur Python, vrais clients.

let app: KominternApp;
let url: string;
const clients: Socket[] = [];

before(async () => {
  app = createKominternApp({
    pythonPath: "python3",
    enginePath: path.resolve(__dirname, "../../gameengine_entry.py"),
    allowedOrigins: ["*"],
    rateLimitMaxEvents: 1_000,
    rateLimitWindowMs: 10_000,
    revealPauseMs: 0,
  });
  await new Promise<void>((resolve) => app.httpServer.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
});

after(async () => {
  for (const client of clients) {
    client.disconnect();
  }
  await app.close();
});

type Player = { socket: Socket; uid: string; playerId: string; inbox: Array<{ event: string; payload: unknown }> };

function open(): Socket {
  const socket = connect(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  clients.push(socket);
  return socket;
}

function record(socket: Socket): Array<{ event: string; payload: unknown }> {
  const inbox: Array<{ event: string; payload: unknown }> = [];
  socket.onAny((event: string, payload: unknown) => inbox.push({ event, payload }));
  return inbox;
}

function next<T = Record<string, unknown>>(socket: Socket, event: string, predicate: (payload: T) => boolean = () => true, timeoutMs = 3_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: T) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      }
    };
    socket.on(event, handler);
  });
}

async function join(event: "create_room" | "join_room", payload: Record<string, unknown>, uid: string): Promise<Player> {
  const socket = open();
  const inbox = record(socket);
  const joined = next<{ playerId: string; code: string }>(socket, "room_joined");
  socket.emit(event, { ...payload, playerUid: uid });
  const { playerId } = await joined;
  return { socket, uid, playerId, inbox };
}

/** Émet la même action pour chaque joueur et attend l'événement de transition attendu. */
async function everyone(players: Player[], event: string, awaited: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const waiting = next(players[0]!.socket, awaited);
  for (const player of players) {
    player.socket.emit(event, payload);
  }
  return waiting;
}

test("a complete 5-player game with rejection, reconnection and seat protection", { timeout: 30_000 }, async () => {
  const host = await join("create_room", { code: "e2e room", pseudo: "Rosa" }, "uid-host-000000000000");
  const code = "E2E-ROOM";
  const players = [host];
  for (let index = 1; index < 5; index += 1) {
    players.push(await join("join_room", { code: "e2e-room", pseudo: `P${index}` }, `uid-player-00000000000${index}`));
  }
  const ids = players.map((player) => player.playerId);
  assert.equal(new Set(ids).size, 5);

  // Personne ne peut rejoindre la partie une fois lancée, même en donnant un playerId existant.
  host.socket.emit("start_game", {});
  await next(host.socket, "game_started");
  const intruder = open();
  const refused = next<{ code: string; message: string }>(intruder, "error");
  intruder.emit("join_room", { code, playerId: ids[1], playerUid: "uid-intruder-000000000" });
  assert.match((await refused).message, /already started/);

  // Ordre de table puis révélation des rôles.
  for (const player of players) {
    player.socket.emit("table_order_tap");
  }
  await next(host.socket, "table_order_updated", (payload: { completed?: boolean }) => payload.completed === true);
  const roleEvents = players.map((player) => next<{ role: string; roleMap?: Record<string, string> }>(player.socket, "role_assigned"));
  for (const player of players) {
    player.socket.emit("table_order_confirmed");
  }
  const roles = await Promise.all(roleEvents);
  const nazis = ids.filter((_, index) => roles[index]?.role === "nazi");
  const communists = ids.filter((_, index) => roles[index]?.role === "communist");
  assert.equal(nazis.length, 2);
  for (const [index, role] of roles.entries()) {
    assert.equal(role.roleMap === undefined, role.role === "communist", `player ${index} sees only what the rules allow`);
  }

  let proposal = await everyone(players, "role_confirmed", "proposal_phase");
  const firstChef = proposal.chef as string;
  const byId = (id: string) => players.find((player) => player.playerId === id) as Player;

  // Rejet : le même chef repropose.
  byId(firstChef).socket.emit("propose_team", { team: communists.slice(0, 2) });
  await next(host.socket, "confidence_phase");
  const rejected = await everyone(players, "confidence_vote", "confidence_revealed", { vote: "no" });
  assert.equal(rejected.approved, false);
  proposal = await everyone(players, "confidence_result_confirmed", "proposal_phase");
  assert.equal(proposal.chef, firstChef);

  // Trois missions communistes : le chef change à chaque manche.
  const chefs = [firstChef];
  let scores: unknown;
  for (let round = 0; round < 3; round += 1) {
    const chef = proposal.chef as string;
    const team = communists.slice(0, proposal.missionSize as number);
    byId(chef).socket.emit("propose_team", { team });
    await next(host.socket, "confidence_phase");
    const approved = await everyone(players, "confidence_vote", "confidence_revealed", { vote: "yes" });
    assert.equal(approved.approved, true);
    await everyone(players, "confidence_result_confirmed", "mission_phase");

    if (round === 1) {
      // Reconnexion en pleine mission : même siège, état complet.
      const dropped = byId(team[0] as string);
      dropped.socket.disconnect();
      const resocket = open();
      const resync = next<{ phase: string; missionProgress: { team: string[] }; role: { role: string } }>(resocket, "resync");
      resocket.emit("join_room", { code, playerUid: dropped.uid });
      const state = await resync;
      assert.equal(state.phase, "mission_vote");
      assert.deepEqual(state.missionProgress.team, team);
      assert.equal(state.role.role, "communist");
      dropped.socket = resocket;
    }

    const revealed = next<{ result: string; scores: unknown }>(host.socket, "mission_revealed");
    for (const member of team) {
      byId(member).socket.emit("mission_vote", { vote: "communist" });
    }
    const mission = await revealed;
    assert.equal(mission.result, "communist");
    scores = mission.scores;
    if (round < 2) {
      proposal = await everyone(players, "mission_result_confirmed", "proposal_phase");
      chefs.push(proposal.chef as string);
    }
  }
  assert.deepEqual(scores, { nazi: 0, communist: 3 });
  assert.equal(new Set(chefs).size, 3, "a different chef for each round");

  const gameOver = await everyone(players, "mission_result_confirmed", "game_over");
  assert.equal(gameOver.winner, "communist");
  const reveal = await everyone(players, "end_game_confirmed", "roles_revealed");
  assert.equal(Object.keys(reveal.roleMap as object).length, 5);

  // Revanche : tout le monde rejoue, une nouvelle partie démarre.
  await everyone(players, "replay_choice", "game_started", { choice: "replay" });
  assert.equal(app.roomManager.getStatus(code), "table_order");

  // Aucun secret de reconnexion n'a jamais été envoyé à un client.
  for (const player of players) {
    const everything = JSON.stringify(player.inbox);
    for (const other of players) {
      assert.ok(!everything.includes(other.uid));
    }
  }
});

test("joining an unknown room reports an error", async () => {
  const socket = open();
  const error = next<{ code: string; message: string }>(socket, "error");
  socket.emit("join_room", { code: "NOPE-404", playerUid: "uid-nobody-0000000000" });
  assert.deepEqual(await error, { code: "invalid_join_room", message: "room not found" });
});

test("malformed payloads are rejected without crashing the server", async () => {
  const socket = open();
  const errors: unknown[] = [];
  socket.on("error", (payload: unknown) => errors.push(payload));
  socket.emit("create_room", "not an object");
  socket.emit("join_room", { code: { $gt: "" } });
  socket.emit("propose_team", { team: "all" });
  socket.emit("set_pseudo", { pseudo: "x".repeat(5_000) });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(errors.length >= 3);
  const alive = next(socket, "room_joined");
  socket.emit("create_room", { playerUid: "uid-alive-00000000000" });
  await alive;
});

test("a 3-player game starts with the real engine: one Nazi, teams of 2", { timeout: 15_000 }, async () => {
  const host = await join("create_room", { code: "TRIO", pseudo: "A" }, "uid-trio-a-0000000000");
  const players = [host];
  for (const name of ["B", "C"]) players.push(await join("join_room", { code: "TRIO", pseudo: name }, `uid-trio-${name.toLowerCase()}-0000000000`));
  host.socket.emit("start_game", {});
  const started = await next<{ missionCount: number }>(host.socket, "game_started");
  assert.equal(started.missionCount, 3);
  for (const player of players) player.socket.emit("table_order_tap");
  await next(host.socket, "table_order_updated", (payload: { completed?: boolean }) => payload.completed === true);
  const roleEvents = players.map((player) => next<{ role: string }>(player.socket, "role_assigned"));
  for (const player of players) player.socket.emit("table_order_confirmed");
  const roles = await Promise.all(roleEvents);
  assert.equal(roles.filter((role) => role.role === "nazi").length, 1);
  const proposal = await everyone(players, "role_confirmed", "proposal_phase");
  assert.equal(proposal.missionSize, 2);
});
