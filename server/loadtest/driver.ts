// Parties simulées : 5 joueurs par room, chaque joueur a sa propre « IP » (comme de vrais joueurs),
// temps de réflexion court entre les actions. On mesure la latence des actions clés.
import { io, type Socket } from "socket.io-client";

const URL = process.env.URL ?? "http://127.0.0.1:3100";
const THINK_MS = Number(process.env.THINK_MS ?? 400);
const stages = (process.env.STAGES ?? "10,25,50,100,150,200").split(",").map(Number);
const STAGE_SECONDS = Number(process.env.STAGE_SECONDS ?? 60);
const PLAYERS = 5;

type Bot = { socket: Socket; playerId: string };
const latencies: number[] = [];
let actions = 0;
let gamesFinished = 0;
let errors = 0;
let ipCounter = 1;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const think = () => sleep(THINK_MS * (0.5 + Math.random()));

function connect(): Socket {
  const ip = `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`;
  return io(URL, { transports: ["websocket"], forceNew: true, reconnection: false, extraHeaders: { "cf-connecting-ip": ip } });
}

function once<T = any>(socket: Socket, event: string, timeoutMs = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => { clearTimeout(timer); resolve(payload); });
  });
}

class Room {
  bots: Bot[] = [];
  stopped = false;
  async open(index: number): Promise<void> {
    const host = connect();
    const joined = once<{ playerId: string; code: string }>(host, "room_joined");
    host.emit("create_room", { pseudo: `H${index}`, playerUid: `uid-load-${index}-host-00000` });
    const { playerId, code } = await joined;
    this.bots.push({ socket: host, playerId });
    for (let p = 1; p < PLAYERS; p += 1) {
      const socket = connect();
      const done = once<{ playerId: string }>(socket, "room_joined");
      socket.emit("join_room", { code, pseudo: `P${index}_${p}`, playerUid: `uid-load-${index}-p${p}-000000` });
      this.bots.push({ socket, playerId: (await done).playerId });
    }
    for (const bot of this.bots) bot.socket.on("error", () => { errors += 1; });
    this.wire();
    host.emit("start_game", {});
  }
  all(event: string, payload: Record<string, unknown> = {}): void {
    for (const bot of this.bots) { bot.socket.emit(event, payload); actions += 1; }
  }
  timed(expect: string): void {
    const start = performance.now();
    this.bots[0]!.socket.once(expect, () => latencies.push(performance.now() - start));
  }
  wire(): void {
    const host = this.bots[0]!.socket;
    host.on("game_started", async () => { await think(); for (const bot of this.bots) { bot.socket.emit("table_order_tap"); actions += 1; await sleep(50); } });
    host.on("table_order_updated", async (p: { completed?: boolean; confirmed?: string[] }) => {
      if (p.completed && (p.confirmed ?? []).length === 0) { await think(); this.all("table_order_confirmed"); }
    });
    host.on("role_assigned", async () => { await think(); this.all("role_confirmed"); });
    host.on("proposal_phase", async (p: { chef: string; missionSize: number; team: string[] }) => {
      if (p.team.length > 0) return;
      await think();
      const chef = this.bots.find((bot) => bot.playerId === p.chef);
      if (!chef) return;
      this.timed("confidence_phase");
      chef.socket.emit("propose_team", { team: this.bots.slice(0, p.missionSize).map((bot) => bot.playerId) }); actions += 1;
    });
    host.on("confidence_phase", async () => { await think(); this.timed("confidence_revealed"); this.all("confidence_vote", { vote: "yes" }); });
    host.on("confidence_revealed", async () => { await think(); this.all("confidence_result_confirmed"); });
    host.on("mission_phase", async (p: { team: string[] }) => {
      await think();
      this.timed("mission_revealed");
      for (const bot of this.bots) if (p.team.includes(bot.playerId)) { bot.socket.emit("mission_vote", { vote: "communist" }); actions += 1; }
    });
    host.on("mission_revealed", async () => { await think(); this.all("mission_result_confirmed"); });
    host.on("game_over", async () => { await think(); this.all("end_game_confirmed"); });
    host.on("roles_revealed", async () => { gamesFinished += 1; if (this.stopped) return; await think(); this.all("replay_choice", { choice: "replay" }); });
  }
  close(): void { this.stopped = true; for (const bot of this.bots) bot.socket.disconnect(); }
}

function pct(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!);
}

(async () => {
  const rooms: Room[] = [];
  for (const target of stages) {
    while (rooms.length < target) {
      const room = new Room();
      rooms.push(room);
      try { await room.open(rooms.length); } catch { errors += 1; }
    }
    latencies.length = 0; actions = 0; gamesFinished = 0; errors = 0;
    await sleep(STAGE_SECONDS * 1000);
    console.log(JSON.stringify({ stage: target, players: target * PLAYERS, actionsPerSec: Math.round(actions / STAGE_SECONDS), gamesFinishedPerMin: Math.round((gamesFinished / STAGE_SECONDS) * 60), latencyP50: pct(latencies, 50), latencyP95: pct(latencies, 95), latencyP99: pct(latencies, 99), samples: latencies.length, errors }));
  }
  rooms.forEach((room) => room.close());
  process.exit(0);
})();
