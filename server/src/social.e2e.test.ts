import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { io as connect } from "socket.io-client";
import type { Socket } from "socket.io-client";

import { createKominternApp } from "./app";
import type { KominternApp } from "./app";
import { MemoryMailer } from "./auth/mailer";
import { loadConfig } from "./config";
import { memoryStores } from "./services";
import type { MemoryGameLogStore } from "./store/gamelog";
import { FakeBridge } from "./test-utils/fakes";

// Comptes, amis, présence, invitations, chat modéré et stats, avec un faux moteur.

const ORIGIN = "http://localhost:8080";
const mailer = new MemoryMailer();
const stores = memoryStores(mailer);
const bridges: FakeBridge[] = [];
let app: KominternApp;
let base: string;
const sockets: Socket[] = [];

before(async () => {
  app = createKominternApp({
    pythonPath: "python3",
    enginePath: "unused",
    allowedOrigins: ["*"],
    rateLimitMaxEvents: 1_000,
    rateLimitWindowMs: 10_000,
    revealPauseMs: 0,
    randomIndexProvider: () => 0,
    config: loadConfig({ PUBLIC_URL: ORIGIN }),
    stores,
    bridgeFactory: () => {
      const bridge = new FakeBridge({});
      bridges.push(bridge);
      return bridge;
    },
  });
  await new Promise<void>((resolve) => app.httpServer.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
});

after(async () => {
  sockets.forEach((socket) => socket.disconnect());
  await app.close();
});

type Account = { id: string; name: string; cookie: string };

async function api(path: string, init: { method?: string; body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
  if (init.cookie !== undefined) headers.Cookie = init.cookie;
  const response = await fetch(`${base}/api${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    redirect: "manual",
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? {} : (JSON.parse(text) as Record<string, any>), setCookie: response.headers.get("set-cookie") };
}

async function signUp(name: string): Promise<Account> {
  const email = `${name.toLowerCase()}@example.org`;
  assert.equal((await api("/auth/register", { body: { email, password: "correct horse battery", displayName: name } })).status, 202);
  const verified = await api("/auth/verify", { body: { email, code: mailer.lastCodeFor(email) } });
  assert.equal(verified.status, 200);
  assert.match(verified.setCookie ?? "", /sid=.+HttpOnly/i);
  return { id: verified.body.user.id, name, cookie: (verified.setCookie ?? "").split(";")[0] as string };
}

function open(cookie?: string): Socket {
  const socket = connect(base, { transports: ["websocket"], forceNew: true, reconnection: false, extraHeaders: cookie === undefined ? {} : { cookie } });
  sockets.push(socket);
  return socket;
}

function next<T = any>(socket: Socket, event: string, predicate: (payload: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 3_000);
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

test("accounts, friends, presence, invitations, moderated chat and stats", { timeout: 30_000 }, async () => {
  // --- API et sécurité
  assert.equal((await api("/auth/login", { body: { email: "x@example.org", password: "x" }, origin: null })).status, 403, "no Origin: rejected (CSRF)");
  assert.equal((await api("/me")).status, 401);
  const [rosa, karl, ...others] = await Promise.all(["Rosa", "Karl", "Clara", "Leon", "Emma"].map(signUp)) as Account[];
  assert.equal((await api("/me", { cookie: rosa!.cookie })).body.user.displayName, "Rosa");

  // --- Amis
  assert.equal((await api("/friends/requests", { body: { displayName: "karl" }, cookie: rosa!.cookie })).body.status, "pending");
  assert.equal((await api(`/users/${karl!.id}/profile`, { cookie: rosa!.cookie })).status, 403);
  const karlFriends = await api("/friends", { cookie: karl!.cookie });
  assert.deepEqual(karlFriends.body.incoming.map((r: { displayName: string }) => r.displayName), ["Rosa"]);
  assert.equal((await api(`/friends/${rosa!.id}/accept`, { body: {}, cookie: karl!.cookie })).status, 204);
  assert.equal((await api(`/users/${karl!.id}/profile`, { cookie: rosa!.cookie })).status, 200);
  assert.equal((await api(`/users/${karl!.id}/profile`, { cookie: others[0]!.cookie })).status, 403);

  // --- Présence
  const karlSocket = open(karl!.cookie);
  await new Promise<void>((resolve) => karlSocket.on("connect", () => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const rosaView = await api("/friends", { cookie: rosa!.cookie });
  assert.equal(rosaView.body.friends[0].status, "online");

  // --- Room et invitation
  const rosaSocket = open(rosa!.cookie);
  const joined = next<{ playerId: string; code: string }>(rosaSocket, "room_joined");
  const named = next<{ players: Array<{ pseudo: string }> }>(rosaSocket, "room_updated", (p) => p.players[0]?.pseudo === "Rosa");
  rosaSocket.emit("create_room", { pseudo: "ignored" });
  const { code, playerId: rosaPlayerId } = await joined;
  await named; // le pseudo du compte remplace le pseudo saisi
  const invite = next<{ from: { displayName: string }; code: string }>(karlSocket, "room_invite");
  rosaSocket.emit("invite_friend", { userId: karl!.id });
  assert.deepEqual(await invite, { from: { userId: rosa!.id, displayName: "Rosa" }, code });

  const players: Array<{ account: Account; socket: Socket; playerId: string }> = [];
  players.push({ account: rosa!, socket: rosaSocket, playerId: rosaPlayerId });
  for (const [account, socket] of [[karl!, karlSocket], ...others.map((o) => [o, open(o.cookie)] as const)] as Array<[Account, Socket]>) {
    const done = next<{ playerId: string }>(socket, "room_joined");
    socket.emit("join_room", { code });
    players.push({ account, socket, playerId: (await done).playerId });
  }

  // --- Chat : message normal, mot signalé masqué, signalement
  const normal = next<{ text: string; pseudo: string }>(karlSocket, "chat_message");
  rosaSocket.emit("chat_send", { text: "  salut   tout le monde " });
  assert.deepEqual(await normal.then((m) => [m.pseudo, m.text]), ["Rosa", "salut tout le monde"]);
  const masked = next<{ text: string }>(rosaSocket, "chat_message");
  karlSocket.emit("chat_send", { text: "Rosa espèce de connard" });
  assert.equal((await masked).text, "Rosa espèce de *******");
  const reported = next(rosaSocket, "report_received");
  rosaSocket.emit("report", { playerId: players[1]!.playerId, reason: "insulte" });
  await reported;
  const logs = stores.gameLogs as MemoryGameLogStore;
  await new Promise((resolve) => setTimeout(resolve, 50));
  const cases = [...logs.cases.values()];
  assert.deepEqual(cases.map((c) => c.trigger.type).sort(), ["flagged_word", "report"]);
  assert.ok(!JSON.stringify(cases).includes("Rosa") && !JSON.stringify(cases).includes("Karl"), "cases are pseudonymized");
  assert.ok(JSON.stringify([...logs.identities.values()]).includes(karl!.id), "the server keeps the link to the accounts");

  // --- Partie complète (faux moteur : les 2 premiers de l'ordre sont nazis)
  const everyone = async (event: string, awaited: string, payload: Record<string, unknown> = {}) => {
    const waiting = next(rosaSocket, awaited);
    players.forEach((p) => p.socket.emit(event, payload));
    return waiting;
  };
  rosaSocket.emit("start_game", {});
  await next(rosaSocket, "game_started");
  const inGame = await api("/friends", { cookie: rosa!.cookie });
  assert.equal(inGame.body.friends[0].status, "in_game");
  for (const p of players) p.socket.emit("table_order_tap");
  await next(rosaSocket, "table_order_updated", (x: { completed: boolean }) => x.completed);
  await everyone("table_order_confirmed", "role_assigned");
  let proposal = await everyone("role_confirmed", "proposal_phase");
  const order = bridges[0]!.roles;
  const communists = players.filter((p) => order[p.playerId] === "communist");
  for (let round = 0; round < 3; round += 1) {
    const chef = players.find((p) => p.playerId === proposal.chef)!;
    const team = communists.slice(0, proposal.missionSize).map((p) => p.playerId);
    chef.socket.emit("propose_team", { team });
    await next(rosaSocket, "confidence_phase");
    await everyone("confidence_vote", "confidence_revealed", { vote: "yes" });
    await everyone("confidence_result_confirmed", "mission_phase");
    const revealed = next(rosaSocket, "mission_revealed");
    for (const member of team) players.find((p) => p.playerId === member)!.socket.emit("mission_vote", { vote: "communist" });
    await revealed;
    proposal = round < 2 ? await everyone("mission_result_confirmed", "proposal_phase") : proposal;
  }
  await everyone("mission_result_confirmed", "game_over");
  await everyone("end_game_confirmed", "roles_revealed");
  await new Promise((resolve) => setTimeout(resolve, 50));

  // --- Log de partie et stats
  const game = [...logs.games.values()][0];
  assert.equal(game?.winner, "communist");
  assert.equal(game?.players.filter((p) => p.userId !== null).length, 5);
  assert.equal(game?.chat.length, 0, "only messages sent during the game are in its log");
  for (const p of players) {
    const profile = await api(`/users/${p.account.id}/profile`, { cookie: p.account.cookie });
    const won = order[p.playerId] === "communist";
    assert.deepEqual(profile.body.profile.stats, {
      wins: won ? 1 : 0,
      losses: won ? 0 : 1,
      gamesNazi: won ? 0 : 1,
      gamesCommunist: won ? 1 : 0,
    });
  }

  // --- Suppression de compte
  assert.equal((await api("/me", { method: "DELETE", cookie: karl!.cookie })).status, 204);
  assert.equal((await api("/me", { cookie: karl!.cookie })).status, 401);
  assert.equal([...logs.games.values()][0]?.players.some((p) => p.userId === karl!.id), false);
});
