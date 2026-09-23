import crypto from "crypto";

import type { Server } from "socket.io";

import { SERVER_EVENTS } from "./events";
import { GameSession } from "./GameSession";
import type { BridgeLike, GameSummary } from "./GameSession";
import { log } from "./logger";
import { MAX_PLAYERS, MIN_PLAYERS, RULESET_PRESETS, parsePreset, parseRuleset, resolveRulesetForPlayerCount } from "./rulesets";
import type { RulesetPreset } from "./rulesets";
import type { RoomStatus, RoomUpdatedPayload } from "./types";

export type ChatMessage = { id: string; playerId: string; pseudo: string; text: string; at: number };

/** Message tel que conservé côté serveur : texte original et état du filtre. */
type StoredChatMessage = ChatMessage & { original: string; flagged: boolean };

type CurrentGame = {
  id: string;
  startedAt: Date;
  players: Array<{ playerId: string; userId: string | null; pseudo: string }>;
  chat: StoredChatMessage[];
  ruleset: unknown;
};

/** Partie terminée (ou annulée), transmise pour le log et les statistiques. */
export type RecordedGame = {
  gameId: string;
  roomCode: string;
  startedAt: Date;
  endedAt: Date;
  outcome: "finished" | "aborted";
  ruleset: unknown;
  players: Array<{ playerId: string; userId: string | null; pseudo: string }>;
  chat: Array<{ id: string; playerId: string; pseudo: string; text: string; masked: boolean; at: Date }>;
  summary: GameSummary;
};

export type RoomHooks = {
  onGameRecorded?: (game: RecordedGame) => Promise<void> | void;
  /** Des comptes entrent en partie ou en sortent (présence « en partie »). */
  onUsersInGame?: (userIds: string[], inGame: boolean) => void;
};

const CHAT_HISTORY_LIMIT = 100;

type RoomRecord = {
  code: string;
  status: RoomStatus;
  playerIds: string[];
  hostPlayerId: string | null;
  targetPlayerCount: number;
  socketByPlayer: Map<string, string>;
  playerByUid: Map<string, string>;
  userIdByPlayer: Map<string, string>;
  chat: StoredChatMessage[];
  currentGame?: CurrentGame;
  pseudoByPlayer: Map<string, string>;
  afkTimers: Map<string, NodeJS.Timeout>;
  afkPlayers: Set<string>;
  replayRequests: Set<string>;
  configuredPreset?: RulesetPreset;
  configuredRuleset?: unknown;
  nextChefId: string | null;
  session?: GameSession;
  starting: boolean;
  emptyTimer?: NodeJS.Timeout;
};

export type RoomManagerOptions = {
  pythonPath: string;
  enginePath: string;
  afkTimeoutMs?: number;
  emptyRoomGraceMs?: number;
  maxRooms?: number;
  engineTimeoutMs?: number;
  revealPauseMs?: number;
  /** Tests : remplace le process Python. */
  bridgeFactory?: () => BridgeLike;
  randomIndexProvider?: (length: number) => number;
  hooks?: RoomHooks;
};

export type CreateRoomOptions = {
  code?: string;
  rulesetPreset?: unknown;
  ruleset?: unknown;
};

export type JoinResult = {
  playerId: string;
  reconnected: boolean;
  /** Socket qui occupait ce siège avant la reconnexion (autre onglet, ancienne connexion). */
  replacedSocketId?: string;
};

const DEFAULT_AFK_TIMEOUT_MS = 60_000;
const DEFAULT_EMPTY_ROOM_GRACE_MS = 120_000;
const DEFAULT_MAX_ROOMS = 200;
const DEFAULT_TARGET_PLAYERS = 5;

export class RoomManager {
  private readonly io: Server;
  private readonly options: RoomManagerOptions;
  private readonly rooms = new Map<string, RoomRecord>();

  public constructor(io: Server, options: RoomManagerOptions) {
    this.io = io;
    this.options = options;
  }

  // ---------------------------------------------------------------- rooms

  public get roomCount(): number {
    return this.rooms.size;
  }

  public hasRoom(code: string): boolean {
    return this.rooms.has(code);
  }

  public createRoom(options: CreateRoomOptions = {}): string {
    if (this.rooms.size >= (this.options.maxRooms ?? DEFAULT_MAX_ROOMS)) {
      throw new Error("server is full, try again later");
    }
    const code = options.code ?? this.generateCode();
    if (this.rooms.has(code)) {
      throw new Error("room code already exists");
    }

    let targetPlayerCount = DEFAULT_TARGET_PLAYERS;
    let configuredPreset: RulesetPreset | undefined;
    let configuredRuleset: unknown;
    if (options.ruleset !== undefined && options.ruleset !== null) {
      configuredRuleset = parseRuleset(options.ruleset);
      targetPlayerCount = (configuredRuleset as { player_count: number }).player_count;
    } else if (options.rulesetPreset !== undefined && options.rulesetPreset !== null && options.rulesetPreset !== "") {
      configuredPreset = parsePreset(options.rulesetPreset);
      targetPlayerCount = RULESET_PRESETS[configuredPreset].playerCount;
    }

    this.rooms.set(code, {
      code,
      status: "waiting",
      playerIds: [],
      hostPlayerId: null,
      targetPlayerCount,
      socketByPlayer: new Map(),
      playerByUid: new Map(),
      userIdByPlayer: new Map(),
      chat: [],
      pseudoByPlayer: new Map(),
      afkTimers: new Map(),
      afkPlayers: new Set(),
      replayRequests: new Set(),
      configuredPreset,
      configuredRuleset,
      nextChefId: null,
      starting: false,
    });
    log.info("room created", { code, targetPlayerCount });
    return code;
  }

  /**
   * Rejoint une room existante. Un `playerUid` déjà connu reprend son siège (rechargement,
   * reconnexion) ; sinon un nouveau joueur est créé, uniquement tant que la room est au salon.
   */
  public joinRoom(code: string, socketId: string, playerUid?: string, userId?: string): JoinResult {
    const room = this.requireRoom(code);
    // Un compte connecté retrouve son siège même depuis un autre appareil.
    const knownPlayerId =
      (playerUid === undefined ? undefined : room.playerByUid.get(playerUid)) ??
      (userId === undefined ? undefined : [...room.userIdByPlayer].find(([, id]) => id === userId)?.[0]);

    if (knownPlayerId !== undefined && room.playerIds.includes(knownPlayerId)) {
      const previous = room.socketByPlayer.get(knownPlayerId);
      room.socketByPlayer.set(knownPlayerId, socketId);
      if (playerUid !== undefined) {
        room.playerByUid.set(playerUid, knownPlayerId);
      }
      this.cancelEmptyTimer(room);
      this.clearAfk(room, knownPlayerId);
      this.reassignHostIfNeeded(room);
      this.emitRoomUpdated(room);
      if (room.session !== undefined) {
        this.runSessionTask(room, (session) => session.handleRosterChange());
      }
      return {
        playerId: knownPlayerId,
        reconnected: true,
        replacedSocketId: previous !== undefined && previous !== socketId ? previous : undefined,
      };
    }

    if (room.status !== "waiting" || room.starting) {
      throw new Error("the game has already started in this room");
    }
    if (room.playerIds.length >= room.targetPlayerCount) {
      throw new Error("room is full");
    }

    const playerId = `p_${crypto.randomBytes(6).toString("hex")}`;
    room.playerIds.push(playerId);
    room.socketByPlayer.set(playerId, socketId);
    room.pseudoByPlayer.set(playerId, `Joueur ${room.playerIds.length}`);
    if (playerUid !== undefined) {
      room.playerByUid.set(playerUid, playerId);
    }
    if (userId !== undefined) {
      room.userIdByPlayer.set(playerId, userId);
    }
    this.cancelEmptyTimer(room);
    this.reassignHostIfNeeded(room);
    this.emitRoomUpdated(room);
    return { playerId, reconnected: false };
  }

  public leaveRoom(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    if (room === undefined || !room.playerIds.includes(playerId)) {
      return;
    }

    if (room.session !== undefined && room.session.hasPlayer(playerId) && room.status !== "finished") {
      // Quitter en pleine partie = abandon immédiat, comme un AFK.
      room.afkPlayers.add(playerId);
      room.socketByPlayer.delete(playerId);
      this.io.to(code).emit(SERVER_EVENTS.PLAYER_AFK, { playerId });
      this.runSessionTask(room, (session) => session.handlePlayerAfk(playerId));
      this.emitRoomUpdated(room);
      this.scheduleEmptyCheck(room);
      return;
    }

    this.removePlayer(room, playerId);
  }

  public handleDisconnect(code: string, playerId: string, socketId: string): void {
    const room = this.rooms.get(code);
    if (room === undefined) {
      return;
    }
    // Un rechargement connecte le nouveau socket avant la déconnexion de l'ancien :
    // on n'efface le lien que s'il pointe encore sur le socket qui part.
    if (room.socketByPlayer.get(playerId) !== socketId) {
      return;
    }
    room.socketByPlayer.delete(playerId);
    this.scheduleAfk(room, playerId);
    this.reassignHostIfNeeded(room);
    this.emitRoomUpdated(room);
    this.scheduleEmptyCheck(room);
  }

  public setPseudo(code: string, playerId: string, pseudo: string): void {
    const room = this.requireRoom(code);
    if (!room.playerIds.includes(playerId)) {
      throw new Error("unknown player for this room");
    }
    room.pseudoByPlayer.set(playerId, pseudo);
    this.emitRoomUpdated(room);
  }

  // ---------------------------------------------------------------- parties

  public async startGame(
    code: string,
    playerId: string,
    options: { allowNonHost?: boolean; rulesetPreset?: unknown; ruleset?: unknown } = {},
  ): Promise<GameSession> {
    const room = this.requireRoom(code);
    if (!options.allowNonHost && room.hostPlayerId !== playerId) {
      throw new Error("only the host can start the game");
    }
    if ((room.status !== "waiting" && room.status !== "finished") || room.session !== undefined || room.starting) {
      throw new Error("game has already started for this room");
    }

    const preset = options.rulesetPreset !== undefined && options.rulesetPreset !== null && options.rulesetPreset !== ""
      ? parsePreset(options.rulesetPreset)
      : room.configuredPreset;
    const ruleset = options.ruleset ?? room.configuredRuleset;
    const resolved = resolveRulesetForPlayerCount(room.playerIds.length, ruleset === undefined ? preset : undefined, ruleset);

    room.starting = true;
    const previousStatus = room.status;
    const session = new GameSession(code, room.playerIds, room.socketByPlayer, this.io, {
      ruleset: resolved,
      getActivePlayerIds: () => room.playerIds.filter((id) => !room.afkPlayers.has(id)),
      getRoomPayload: () => this.getRoomPayload(code),
      getHostPlayerId: () => room.hostPlayerId,
      nextChefId: room.nextChefId,
      onRevealComplete: () => {
        room.status = "playing";
        this.emitRoomUpdated(room);
      },
      onGameFinished: (nextChefId, summary) => this.onGameFinished(room, session, nextChefId, summary),
      onAborted: (_reason, summary) => this.onGameAborted(room, session, summary),
      randomIndexProvider: this.options.randomIndexProvider,
      bridge: this.options.bridgeFactory?.(),
      pythonPath: this.options.pythonPath,
      enginePath: this.options.enginePath,
      engineTimeoutMs: this.options.engineTimeoutMs,
      revealPauseMs: this.options.revealPauseMs,
    });

    try {
      room.configuredPreset = ruleset === undefined ? preset : undefined;
      room.configuredRuleset = ruleset;
      room.replayRequests.clear();
      room.session = session;
      room.status = "table_order";
      room.currentGame = {
        id: `g_${crypto.randomBytes(8).toString("hex")}`,
        startedAt: new Date(),
        players: room.playerIds.map((playerId) => ({
          playerId,
          userId: room.userIdByPlayer.get(playerId) ?? null,
          pseudo: room.pseudoByPlayer.get(playerId) ?? playerId,
        })),
        chat: [],
        ruleset: resolved.engineArgs,
      };
      this.notifyUsersInGame(room, true);
      await session.start();
      this.emitRoomUpdated(room);
      log.info("game started", { code, players: room.playerIds.length });
      return session;
    } catch (error) {
      session.dispose();
      room.session = undefined;
      room.currentGame = undefined;
      room.status = previousStatus;
      this.notifyUsersInGame(room, false);
      throw error;
    } finally {
      room.starting = false;
    }
  }

  /** Choix « rejouer » en fin de partie ; démarre quand tous les joueurs connectés ont choisi. */
  public async requestReplay(code: string, playerId: string): Promise<void> {
    const room = this.requireRoom(code);
    if (room.status !== "finished") {
      throw new Error("replay is only available after a game finishes");
    }
    if (!room.playerIds.includes(playerId)) {
      throw new Error("unknown player for this room");
    }
    room.replayRequests.add(playerId);
    this.emitRoomUpdated(room);
    await this.maybeStartReplay(room);
  }

  public getSession(code: string): GameSession | undefined {
    return this.rooms.get(code)?.session;
  }

  public getStatus(code: string): RoomStatus | undefined {
    return this.rooms.get(code)?.status;
  }

  public getRoomPayload(code: string): RoomUpdatedPayload {
    const room = this.requireRoom(code);
    return {
      players: room.playerIds.map((playerId) => ({
        playerId,
        pseudo: room.pseudoByPlayer.get(playerId) ?? playerId,
        isHost: room.hostPlayerId === playerId,
        isAfk: room.afkPlayers.has(playerId),
        isConnected: room.socketByPlayer.has(playerId),
      })),
      code,
      hostPlayerId: room.hostPlayerId,
      targetPlayerCount: room.targetPlayerCount,
      status: room.status,
    };
  }

  // ---------------------------------------------------------------- chat et identités

  /** Ajoute un message au chat de la room et le diffuse (texte déjà filtré dans `text`). */
  public addChatMessage(code: string, playerId: string, text: string, original: string, flagged: boolean): ChatMessage {
    const room = this.requireRoom(code);
    if (!room.playerIds.includes(playerId)) {
      throw new Error("unknown player for this room");
    }
    const stored: StoredChatMessage = {
      id: `m_${crypto.randomBytes(6).toString("hex")}`,
      playerId,
      pseudo: room.pseudoByPlayer.get(playerId) ?? playerId,
      text,
      at: Date.now(),
      original,
      flagged,
    };
    room.chat.push(stored);
    if (room.chat.length > CHAT_HISTORY_LIMIT) {
      room.chat.splice(0, room.chat.length - CHAT_HISTORY_LIMIT);
    }
    room.currentGame?.chat.push(stored);
    const message = publicMessage(stored);
    this.io.to(code).emit(SERVER_EVENTS.CHAT_MESSAGE, message);
    return message;
  }

  public getChat(code: string): ChatMessage[] {
    return (this.rooms.get(code)?.chat ?? []).map(publicMessage);
  }

  /** Messages récents avec leur texte original, pour constituer un dossier de modération. */
  public getChatForModeration(code: string): Array<ChatMessage & { original: string; flagged: boolean }> {
    return (this.rooms.get(code)?.chat ?? []).map((message) => ({ ...message }));
  }

  public getIdentity(code: string, playerId: string): { playerId: string; userId: string | null; pseudo: string } | null {
    const room = this.rooms.get(code);
    if (room === undefined || !room.playerIds.includes(playerId)) {
      return null;
    }
    return { playerId, userId: room.userIdByPlayer.get(playerId) ?? null, pseudo: room.pseudoByPlayer.get(playerId) ?? playerId };
  }

  public getCurrentGameId(code: string): string | null {
    return this.rooms.get(code)?.currentGame?.id ?? null;
  }

  public disposeAll(): void {
    for (const room of this.rooms.values()) {
      this.clearTimers(room);
      room.session?.dispose();
      room.session = undefined;
    }
    this.rooms.clear();
  }

  // ---------------------------------------------------------------- interne

  private onGameFinished(room: RoomRecord, session: GameSession, nextChefId: string | null, summary: GameSummary): void {
    if (room.session !== session) {
      return;
    }
    this.recordGame(room, "finished", summary);
    room.session = undefined;
    room.status = "finished";
    room.nextChefId = nextChefId;
    room.replayRequests.clear();
    // Les joueurs AFK ont abandonné : ils libèrent leur siège.
    for (const playerId of [...room.afkPlayers]) {
      this.removePlayer(room, playerId, false);
    }
    if (this.rooms.has(room.code)) {
      this.emitRoomUpdated(room);
    }
  }

  private onGameAborted(room: RoomRecord, session: GameSession, summary: GameSummary): void {
    if (room.session !== session) {
      return;
    }
    this.recordGame(room, "aborted", summary);
    room.session = undefined;
    room.status = "waiting";
    for (const playerId of [...room.afkPlayers]) {
      this.removePlayer(room, playerId, false);
    }
    if (this.rooms.has(room.code)) {
      this.emitRoomUpdated(room);
    }
  }

  private async maybeStartReplay(room: RoomRecord): Promise<void> {
    if (room.status !== "finished" || room.starting) {
      return;
    }
    const connected = room.playerIds.filter((id) => room.socketByPlayer.has(id));
    if (connected.length === 0 || !connected.every((id) => room.replayRequests.has(id))) {
      return;
    }

    // Les absents ne bloquent pas la revanche : ils perdent leur siège.
    for (const playerId of room.playerIds.filter((id) => !room.socketByPlayer.has(id))) {
      this.removePlayer(room, playerId, false);
    }

    try {
      await this.startGame(room.code, connected[0] as string, { allowNonHost: true });
    } catch (error) {
      // Nombre de joueurs incompatible avec les règles : retour au salon pour compléter.
      log.info("replay falls back to lobby", { code: room.code, reason: error instanceof Error ? error.message : String(error) });
      room.status = "waiting";
      room.replayRequests.clear();
      this.emitRoomUpdated(room);
    }
  }

  private recordGame(room: RoomRecord, outcome: RecordedGame["outcome"], summary: GameSummary): void {
    const game = room.currentGame;
    room.currentGame = undefined;
    this.notifyUsersInGame(room, false);
    if (game === undefined || this.options.hooks?.onGameRecorded === undefined) {
      return;
    }
    const record: RecordedGame = {
      gameId: game.id,
      roomCode: room.code,
      startedAt: game.startedAt,
      endedAt: new Date(),
      outcome,
      ruleset: game.ruleset,
      players: game.players,
      chat: game.chat.map((message) => ({
        id: message.id,
        playerId: message.playerId,
        pseudo: message.pseudo,
        text: message.original,
        masked: message.flagged,
        at: new Date(message.at),
      })),
      summary,
    };
    Promise.resolve(this.options.hooks.onGameRecorded(record)).catch((error: unknown) =>
      log.error("failed to record game", { code: room.code, error }),
    );
  }

  private notifyUsersInGame(room: RoomRecord, inGame: boolean): void {
    const userIds = room.playerIds.map((id) => room.userIdByPlayer.get(id)).filter((id): id is string => id !== undefined);
    if (userIds.length > 0) {
      this.options.hooks?.onUsersInGame?.(userIds, inGame);
    }
  }

  private removePlayer(room: RoomRecord, playerId: string, notify = true): void {
    const index = room.playerIds.indexOf(playerId);
    if (index === -1) {
      return;
    }
    room.playerIds.splice(index, 1);
    room.socketByPlayer.delete(playerId);
    room.pseudoByPlayer.delete(playerId);
    room.userIdByPlayer.delete(playerId);
    room.replayRequests.delete(playerId);
    for (const [uid, mapped] of room.playerByUid) {
      if (mapped === playerId) {
        room.playerByUid.delete(uid);
      }
    }
    this.clearAfk(room, playerId);
    if (room.nextChefId === playerId) {
      room.nextChefId = null;
    }

    if (room.playerIds.length === 0) {
      this.deleteRoom(room);
      return;
    }

    this.reassignHostIfNeeded(room);
    if (notify) {
      this.io.to(room.code).emit(SERVER_EVENTS.PLAYER_LEFT, { playerId });
      this.emitRoomUpdated(room);
    }
    this.scheduleEmptyCheck(room);
    if (room.status === "finished") {
      void this.maybeStartReplay(room).catch((error: unknown) => log.error("replay failed", { code: room.code, error }));
    }
  }

  private deleteRoom(room: RoomRecord): void {
    this.clearTimers(room);
    room.session?.dispose();
    room.session = undefined;
    this.rooms.delete(room.code);
    log.info("room deleted", { code: room.code });
  }

  private scheduleAfk(room: RoomRecord, playerId: string): void {
    const existing = room.afkTimers.get(playerId);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      room.afkTimers.delete(playerId);
      if (this.rooms.get(room.code) !== room || room.socketByPlayer.has(playerId) || !room.playerIds.includes(playerId)) {
        return;
      }
      this.markAfk(room, playerId);
    }, this.options.afkTimeoutMs ?? DEFAULT_AFK_TIMEOUT_MS);
    timer.unref();
    room.afkTimers.set(playerId, timer);
  }

  private markAfk(room: RoomRecord, playerId: string): void {
    if (room.status === "waiting" || room.status === "finished") {
      // Au salon, un absent libère simplement sa place.
      this.removePlayer(room, playerId);
      return;
    }
    room.afkPlayers.add(playerId);
    this.io.to(room.code).emit(SERVER_EVENTS.PLAYER_AFK, { playerId });
    this.emitRoomUpdated(room);
    this.runSessionTask(room, (session) => session.handlePlayerAfk(playerId));
  }

  private clearAfk(room: RoomRecord, playerId: string): void {
    const timer = room.afkTimers.get(playerId);
    if (timer !== undefined) {
      clearTimeout(timer);
      room.afkTimers.delete(playerId);
    }
    room.afkPlayers.delete(playerId);
  }

  /** Si plus personne n'est connecté, la room (et son process Python) disparaît après un délai. */
  private scheduleEmptyCheck(room: RoomRecord): void {
    if (room.socketByPlayer.size > 0 || room.emptyTimer !== undefined || !this.rooms.has(room.code)) {
      return;
    }
    room.emptyTimer = setTimeout(() => {
      room.emptyTimer = undefined;
      if (this.rooms.get(room.code) === room && room.socketByPlayer.size === 0) {
        this.deleteRoom(room);
      }
    }, this.options.emptyRoomGraceMs ?? DEFAULT_EMPTY_ROOM_GRACE_MS);
    room.emptyTimer.unref();
  }

  private cancelEmptyTimer(room: RoomRecord): void {
    if (room.emptyTimer !== undefined) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = undefined;
    }
  }

  private clearTimers(room: RoomRecord): void {
    this.cancelEmptyTimer(room);
    for (const timer of room.afkTimers.values()) {
      clearTimeout(timer);
    }
    room.afkTimers.clear();
  }

  /** L'hôte doit être un joueur présent ; on préfère un joueur connecté. */
  private reassignHostIfNeeded(room: RoomRecord): void {
    const host = room.hostPlayerId;
    const hostPresent = host !== null && room.playerIds.includes(host);
    const hostConnected = hostPresent && room.socketByPlayer.has(host);
    if (hostConnected) {
      return;
    }
    const connected = room.playerIds.find((id) => room.socketByPlayer.has(id));
    if (connected !== undefined) {
      room.hostPlayerId = connected;
    } else if (!hostPresent) {
      room.hostPlayerId = room.playerIds[0] ?? null;
    }
  }

  private runSessionTask(room: RoomRecord, task: (session: GameSession) => Promise<void>): void {
    const session = room.session;
    if (session === undefined) {
      return;
    }
    task(session).catch((error: unknown) => {
      log.error("session task failed", { code: room.code, error });
    });
  }

  private emitRoomUpdated(room: RoomRecord): void {
    this.io.to(room.code).emit(SERVER_EVENTS.ROOM_UPDATED, this.getRoomPayload(room.code));
  }

  private requireRoom(code: string): RoomRecord {
    const room = this.rooms.get(code);
    if (room === undefined) {
      throw new Error("room not found");
    }
    return room;
  }

  private generateCode(): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = crypto.randomBytes(3).toString("hex").toUpperCase();
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    throw new Error("could not allocate a room code");
  }
}

function publicMessage(message: StoredChatMessage): ChatMessage {
  return { id: message.id, playerId: message.playerId, pseudo: message.pseudo, text: message.text, at: message.at };
}

export { MAX_PLAYERS, MIN_PLAYERS };
