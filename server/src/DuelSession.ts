import type { Server } from "socket.io";

import { SERVER_EVENTS } from "./events";
import type { BridgeLike, DuelSummary, DuelVote, GameSummary, TurnKind } from "./GameSession";
import { log } from "./logger";
import { PythonBridge } from "./PythonBridge";
import type { Faction, ResyncPayload, RoleMap, RoomUpdatedPayload } from "./types";

// Duel à 2 joueurs (gameengine/duel.py) : révélation du rôle, discussion libre, vote secret
// « confiance » ou « nazi ! », puis résultat. Personne ne voit le rôle de l'autre avant la fin.

export type DuelConfig = {
  getActivePlayerIds: () => string[];
  getRoomPayload: () => RoomUpdatedPayload;
  onRevealComplete: () => void;
  onGameDecided?: (summary: GameSummary) => void;
  onGameFinished: (nextChefId: string | null, summary: GameSummary) => void;
  onAborted: (reason: string, summary: GameSummary) => void;
  onTurn?: (playerIds: string[], kind: TurnKind) => void;
  bridge?: BridgeLike;
  pythonPath?: string;
  enginePath?: string;
  engineTimeoutMs?: number;
  /** Tests : tirage des rôles reproductible. */
  seed?: number;
};

type DuelPhase = "starting" | "revealing" | "voting" | "finished";

const DUEL_REASONS = new Set([
  "mutual_trust",
  "false_accusation",
  "mutual_accusation",
  "nazi_unmasked",
  "nazi_gave_himself_away",
  "nazi_accepted",
  "nazis_found_each_other",
  "nazi_found",
  "nazis_trusted_each_other",
]);

export class DuelSession {
  public readonly mode = "duel" as const;
  private readonly bridge: BridgeLike;
  private readonly playerIds: string[];
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private phase: DuelPhase = "starting";
  private roleMap: RoleMap = {};
  private readonly revealed = new Set<string>();
  private readonly votes = new Map<string, DuelVote>();
  private result: DuelSummary | null = null;

  public constructor(
    private readonly roomId: string,
    playerIds: string[],
    private readonly socketByPlayer: Map<string, string>,
    private readonly io: Server,
    private readonly config: DuelConfig,
  ) {
    this.playerIds = [...playerIds];
    this.bridge =
      config.bridge ??
      new PythonBridge(config.pythonPath ?? "python3", config.enginePath ?? "", {
        timeoutMs: config.engineTimeoutMs,
        onUnexpectedExit: (reason) => this.handleEngineFailure(reason),
      });
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public hasPlayer(playerId: string): boolean {
    return this.playerIds.includes(playerId);
  }

  public summary(): GameSummary {
    return {
      duel: this.result === null ? null : { ...this.result, winners: [...this.result.winners], votes: { ...this.result.votes } },
      turnOrder: [...this.playerIds],
      roleMap: { ...this.roleMap },
      confidenceHistory: [],
      missionHistory: [],
      scores: { nazi: 0, communist: 0 },
      gameOver: null,
    };
  }

  public start(): Promise<void> {
    return this.serial(async () => {
      if (this.playerIds.length !== 2) throw new Error("a duel needs exactly 2 players");
      const raw = (await this.bridge.send("duel_start", { player_ids: this.playerIds, ...(this.config.seed === undefined ? {} : { seed: this.config.seed }) })) as { roles?: unknown };
      const roles = raw?.roles as Record<string, unknown> | undefined;
      for (const playerId of this.playerIds) {
        const role = roles?.[playerId];
        if (role !== "nazi" && role !== "communist") throw new Error("engine returned invalid duel roles");
        this.roleMap[playerId] = role;
      }
      this.phase = "revealing";
      this.toRoom(SERVER_EVENTS.GAME_STARTED, { playerIds: [...this.playerIds], mode: "duel", missionCount: 0, missionSizes: [] });
      for (const playerId of this.playerIds) {
        // Seulement son propre rôle, nazi compris : c'est tout le principe du duel.
        this.toPlayer(playerId, SERVER_EVENTS.ROLE_ASSIGNED, { playerId, role: this.roleMap[playerId], turnOrder: [...this.playerIds] });
      }
    });
  }

  public syncPlayer(playerId: string): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.toPlayer(playerId, SERVER_EVENTS.RESYNC, this.resyncPayload(playerId));
    });
  }

  public confirmRoleReveal(playerId: string): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      if (this.phase !== "revealing") throw new Error("action not allowed now");
      this.revealed.add(playerId);
      this.tryOpenVote();
    });
  }

  public handleDuelVote(playerId: string, vote: DuelVote): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      if (this.phase !== "voting") throw new Error("action not allowed now");
      if (this.votes.has(playerId)) throw new Error("you have already voted");
      this.votes.set(playerId, vote);
      this.toRoom(SERVER_EVENTS.DUEL_PROGRESS, { votedPlayerIds: [...this.votes.keys()] });
      await this.tryResolve();
    });
  }

  /** Absent trop longtemps : l'autre joueur gagne le duel. */
  public handlePlayerAfk(playerId: string): Promise<void> {
    return this.serial(async () => {
      if (!this.playerIds.includes(playerId) || this.phase === "finished") return;
      const other = this.playerIds.find((id) => id !== playerId) as string;
      this.finish({ winners: [other], reason: "forfeit", votes: Object.fromEntries(this.votes), forfeitedBy: playerId });
    });
  }

  public handleRosterChange(): Promise<void> {
    return this.serial(async () => {
      if (this.phase === "revealing") this.tryOpenVote();
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bridge.dispose();
  }

  public handleEngineFailure(reason: string): void {
    if (this.disposed) return;
    log.error("duel aborted after engine failure", { roomId: this.roomId, reason });
    this.toRoom(SERVER_EVENTS.ERROR, { code: "engine_failure", message: "the game engine stopped unexpectedly; back to the lobby" });
    this.toRoom(SERVER_EVENTS.GAME_ABORTED, { reason: "engine_failure" });
    this.dispose();
    this.config.onAborted(reason, this.summary());
  }

  // ---------------------------------------------------------------- interne

  private tryOpenVote(): void {
    const active = this.activeIds();
    if (active.length === 0 || !active.every((id) => this.revealed.has(id))) return;
    this.phase = "voting";
    this.config.onRevealComplete();
    this.toRoom(SERVER_EVENTS.DUEL_PHASE, { votedPlayerIds: [] });
    this.config.onTurn?.(this.activeIds(), "vote");
  }

  private async tryResolve(): Promise<void> {
    if (!this.playerIds.every((id) => this.votes.has(id))) return;
    const votes = Object.fromEntries(this.votes) as Record<string, DuelVote>;
    let raw: { winners?: unknown; reason?: unknown };
    try {
      raw = (await this.bridge.send("duel_resolve", { votes })) as typeof raw;
    } catch (error) {
      log.error("duel resolution failed", { roomId: this.roomId, error });
      this.votes.clear();
      this.toRoom(SERVER_EVENTS.ERROR, { code: "vote_failed", message: "the vote could not be counted, please vote again" });
      this.toRoom(SERVER_EVENTS.DUEL_PHASE, { votedPlayerIds: [] });
      return;
    }
    const winners = Array.isArray(raw?.winners) ? raw.winners.filter((id): id is string => typeof id === "string" && this.playerIds.includes(id)) : [];
    const reason = typeof raw?.reason === "string" && DUEL_REASONS.has(raw.reason) ? raw.reason : "unknown";
    this.finish({ winners, reason, votes });
  }

  private finish(result: DuelSummary): void {
    this.phase = "finished";
    this.result = result;
    const summary = this.summary();
    this.config.onGameDecided?.(summary);
    this.toRoom(SERVER_EVENTS.DUEL_RESULT, { ...result, roleMap: { ...this.roleMap } });
    this.dispose();
    this.config.onGameFinished(null, summary);
  }

  private resyncPayload(playerId: string): ResyncPayload {
    const role = this.roleMap[playerId] as Faction | undefined;
    return {
      room: this.config.getRoomPayload(),
      phase: this.phase === "voting" ? "duel_vote" : "role_reveal",
      mode: "duel",
      missionCount: 0,
      missionSizes: [],
      scores: { nazi: 0, communist: 0 },
      tableOrder: [],
      tableOrderConfirmed: [],
      turnOrder: [...this.playerIds],
      role: role === undefined ? null : { role },
      proposal: null,
      confidence: null,
      hasVotedConfidence: false,
      hasVotedMission: false,
      hasConfirmed: this.revealed.has(playerId),
      mission: null,
      missionProgress: null,
      confidenceHistory: [],
      missionHistory: [],
      gameOver: null,
      duel: { votedPlayerIds: [...this.votes.keys()], hasVoted: this.votes.has(playerId) },
    };
  }

  private activeIds(): string[] {
    const active = new Set(this.config.getActivePlayerIds());
    return this.playerIds.filter((id) => active.has(id));
  }

  private ensureKnownPlayer(playerId: string): void {
    if (!this.playerIds.includes(playerId)) throw new Error("unknown player id for this session");
  }

  private toRoom(event: string, payload?: unknown): void {
    if (this.disposed && event !== SERVER_EVENTS.ERROR && event !== SERVER_EVENTS.GAME_ABORTED) return;
    this.io.to(this.roomId).emit(event, payload);
  }

  private toPlayer(playerId: string, event: string, payload?: unknown): void {
    const socketId = this.socketByPlayer.get(playerId);
    if (socketId !== undefined && !this.disposed) this.io.to(socketId).emit(event, payload);
  }

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const run = this.queue.then(() => {
      if (this.disposed) throw new Error("the game is no longer running");
      return action();
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
