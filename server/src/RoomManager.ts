import crypto from "crypto";

import type { Server } from "socket.io";

import { SERVER_EVENTS } from "./events";
import { DuelSession } from "./DuelSession";
import { GameSession } from "./GameSession";
import type { BridgeLike, GameSummary, TurnKind } from "./GameSession";
import { log } from "./logger";
import { MAX_PLAYERS, MIN_PLAYERS, RULESET_PRESETS, parsePace, parsePreset, parseRuleset, resolveRulesetForPlayerCount } from "./rulesets";
import type { GamePace, RulesetPreset } from "./rulesets";
import type { PlayerSummary, PushSubscriptionData, RoomStatus, RoomUpdatedPayload } from "./types";

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
  /** Notification à un joueur (écran éteint ou déconnecté) ; la room fournit son abonnement. */
  onNotify?: (code: string, playerId: string, notification: PlayerNotification) => void;
};

export type PlayerNotification =
  | { kind: TurnKind }
  | { kind: "absence_warning"; secondsLeft: number }
  | { kind: "absence_hold"; by: string };

/** Absence d'un joueur en pleine partie : compte à rebours avant l'abandon, ou mise en attente. */
type Absence = {
  since: number;
  kickAt: number;
  /** Pseudo du joueur qui a choisi d'attendre, ou null pendant le compte à rebours normal. */
  heldBy: string | null;
  /** Nombre de mises en attente pendant cette absence (plafonné : pas de blocage sans fin). */
  holds: number;
  timers: NodeJS.Timeout[];
};

const MAX_HOLDS_PER_ABSENCE = 3;
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Pseudo unique dans la room (insensible à la casse) : personne ne peut se faire passer pour un autre joueur. */
function uniquePseudo(room: { playerIds: string[]; pseudoByPlayer: Map<string, string> }, playerId: string, pseudo: string): string {
  const taken = new Set(room.playerIds.filter((id) => id !== playerId).map((id) => (room.pseudoByPlayer.get(id) ?? "").toLowerCase()));
  if (!taken.has(pseudo.toLowerCase())) return pseudo;
  for (let index = 2; ; index += 1) {
    const candidate = `${pseudo.slice(0, 17)} ${index}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

const CHAT_HISTORY_LIMIT = 100;

/** À 2 joueurs, une room sans règles imposées joue un duel (gameengine/duel.py). */
export const DUEL_PLAYERS = 2;

export type AnySession = GameSession | DuelSession;

type RoomRecord = {
  code: string;
  status: RoomStatus;
  playerIds: string[];
  hostPlayerId: string | null;
  /** Règles libres : de 3 à 11 joueurs. Preset ou règles perso : nombre exact. */
  minPlayers: number;
  maxPlayers: number;
  socketByPlayer: Map<string, string>;
  playerByUid: Map<string, string>;
  userIdByPlayer: Map<string, string>;
  chatEnabled: boolean;
  isPublic: boolean;
  /** Règles libres : partie classique ou rapide. */
  pace: GamePace;
  chat: StoredChatMessage[];
  currentGame?: CurrentGame;
  pseudoByPlayer: Map<string, string>;
  afkTimers: Map<string, NodeJS.Timeout>;
  afkPlayers: Set<string>;
  absences: Map<string, Absence>;
  /** Joueurs connectés dont l'écran est caché (téléphone verrouillé, autre app). */
  hiddenPlayers: Set<string>;
  pushByPlayer: Map<string, PushSubscriptionData>;
  replayRequests: Set<string>;
  /** Secrets de reconnexion des joueurs exclus : ils ne peuvent pas revenir dans cette room. */
  kickedUids: Set<string>;
  kickedUserIds: Set<string>;
  configuredPreset?: RulesetPreset;
  configuredRuleset?: unknown;
  nextChefId: string | null;
  session?: AnySession;
  starting: boolean;
  emptyTimer?: NodeJS.Timeout;
};

export type RoomManagerOptions = {
  pythonPath: string;
  enginePath: string;
  afkTimeoutMs?: number;
  /** Durée d'une mise en attente d'un joueur absent, choisie par les autres. */
  absenceHoldMs?: number;
  /** Avertissement (notification) envoyé à l'absent avant son abandon. */
  absenceWarningMs?: number;
  emptyRoomGraceMs?: number;
  maxRooms?: number;
  engineTimeoutMs?: number;
  revealPauseMs?: number;
  /** Tests : remplace le process Python. */
  bridgeFactory?: () => BridgeLike;
  /** Tests : tirage des rôles du duel reproductible. */
  duelSeed?: number;
  randomIndexProvider?: (length: number) => number;
  hooks?: RoomHooks;
};

export type CreateRoomOptions = {
  code?: string;
  rulesetPreset?: unknown;
  ruleset?: unknown;
  chatEnabled?: boolean;
  isPublic?: boolean;
  pace?: unknown;
};

export type JoinResult = {
  playerId: string;
  reconnected: boolean;
  /** Socket qui occupait ce siège avant la reconnexion (autre onglet, ancienne connexion). */
  replacedSocketId?: string;
};

const DEFAULT_AFK_TIMEOUT_MS = 60_000;
const DEFAULT_ABSENCE_HOLD_MS = 5 * 60_000;
const DEFAULT_ABSENCE_WARNING_MS = 20_000;
const DEFAULT_EMPTY_ROOM_GRACE_MS = 120_000;
const DEFAULT_MAX_ROOMS = 200;

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

    let minPlayers = DUEL_PLAYERS;
    let maxPlayers = MAX_PLAYERS;
    let configuredPreset: RulesetPreset | undefined;
    let configuredRuleset: unknown;
    if (options.ruleset !== undefined && options.ruleset !== null) {
      configuredRuleset = parseRuleset(options.ruleset);
      minPlayers = maxPlayers = (configuredRuleset as { player_count: number }).player_count;
    } else if (options.rulesetPreset !== undefined && options.rulesetPreset !== null && options.rulesetPreset !== "") {
      configuredPreset = parsePreset(options.rulesetPreset);
      minPlayers = maxPlayers = RULESET_PRESETS[configuredPreset].playerCount;
    }

    this.rooms.set(code, {
      code,
      status: "waiting",
      playerIds: [],
      hostPlayerId: null,
      minPlayers,
      maxPlayers,
      socketByPlayer: new Map(),
      playerByUid: new Map(),
      userIdByPlayer: new Map(),
      // Une room publique se joue à distance : chat toujours disponible.
      chatEnabled: options.isPublic === true || options.chatEnabled !== false,
      isPublic: options.isPublic === true,
      pace: parsePace(options.pace),
      chat: [],
      pseudoByPlayer: new Map(),
      afkTimers: new Map(),
      afkPlayers: new Set(),
      absences: new Map(),
      hiddenPlayers: new Set(),
      pushByPlayer: new Map(),
      replayRequests: new Set(),
      kickedUids: new Set(),
      kickedUserIds: new Set(),
      configuredPreset,
      configuredRuleset,
      nextChefId: null,
      starting: false,
    });
    log.info("room created", { code, minPlayers, maxPlayers });
    return code;
  }

  /**
   * Rejoint une room existante. Un `playerUid` déjà connu reprend son siège (rechargement,
   * reconnexion) ; sinon un nouveau joueur est créé, uniquement tant que la room est au salon.
   */
  public joinRoom(code: string, socketId: string, playerUid?: string, userId?: string): JoinResult {
    const room = this.requireRoom(code);
    // Un compte connecté retrouve son siège même depuis un autre appareil.
    // Un socket n'occupe qu'un seul siège : un second join sur la même room reprend le premier
    // (sinon des sièges fantômes, jamais déconnectés, bloqueraient la room et le serveur).
    const knownPlayerId =
      [...room.socketByPlayer].find(([, id]) => id === socketId)?.[0] ??
      (playerUid === undefined ? undefined : room.playerByUid.get(playerUid)) ??
      (userId === undefined ? undefined : [...room.userIdByPlayer].find(([, id]) => id === userId)?.[0]);

    if (knownPlayerId !== undefined && room.playerIds.includes(knownPlayerId)) {
      const previous = room.socketByPlayer.get(knownPlayerId);
      room.socketByPlayer.set(knownPlayerId, socketId);
      if (playerUid !== undefined) {
        room.playerByUid.set(playerUid, knownPlayerId);
      }
      this.cancelEmptyTimer(room);
      room.hiddenPlayers.delete(knownPlayerId);
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

    if ((playerUid !== undefined && room.kickedUids.has(playerUid)) || (userId !== undefined && room.kickedUserIds.has(userId))) {
      throw new Error("you were removed from this room by the host");
    }
    // Entre deux parties (écran de fin), la room accueille de nouveau : un joueur compté absent
    // retrouve ses amis au lieu d'une erreur.
    if ((room.status !== "waiting" && room.status !== "finished") || room.starting) {
      throw new Error("the game has already started in this room");
    }
    if (room.isPublic && userId === undefined) {
      throw new Error("log in to join public rooms");
    }
    if (room.playerIds.length >= room.maxPlayers) {
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
      this.clearAbsence(room, playerId);
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

  // ---------------------------------------------------------------- contrôles de l'hôte

  private requireHostInLobby(room: RoomRecord, hostId: string): void {
    if (room.hostPlayerId !== hostId) {
      throw new Error("only the host can do that");
    }
    if (room.status !== "waiting" || room.starting) {
      throw new Error("only possible in the waiting room");
    }
  }

  /** Exclut un joueur du salon ; renvoie son socket (à déconnecter de la room) s'il est connecté. */
  public kickPlayer(code: string, hostId: string, targetId: string): string | undefined {
    const room = this.requireRoom(code);
    this.requireHostInLobby(room, hostId);
    if (targetId === hostId || !room.playerIds.includes(targetId)) {
      throw new Error("unknown player for this room");
    }
    const socketId = room.socketByPlayer.get(targetId);
    for (const [uid, playerId] of room.playerByUid) {
      if (playerId === targetId) room.kickedUids.add(uid);
    }
    const userId = room.userIdByPlayer.get(targetId);
    if (userId !== undefined) room.kickedUserIds.add(userId);
    this.removePlayer(room, targetId);
    return socketId;
  }

  public transferHost(code: string, hostId: string, targetId: string): void {
    const room = this.requireRoom(code);
    this.requireHostInLobby(room, hostId);
    if (!room.playerIds.includes(targetId) || targetId === hostId) {
      throw new Error("unknown player for this room");
    }
    room.hostPlayerId = targetId;
    this.emitRoomUpdated(room);
  }

  public setChatEnabled(code: string, hostId: string, enabled: boolean): void {
    const room = this.requireRoom(code);
    this.requireHostInLobby(room, hostId);
    if (room.isPublic && !enabled) {
      throw new Error("public rooms always have chat");
    }
    room.chatEnabled = enabled;
    this.emitRoomUpdated(room);
  }

  public setPace(code: string, hostId: string, pace: unknown): void {
    const room = this.requireRoom(code);
    this.requireHostInLobby(room, hostId);
    room.pace = parsePace(pace);
    this.emitRoomUpdated(room);
  }

  public setPublic(code: string, hostId: string, isPublic: boolean): void {
    const room = this.requireRoom(code);
    this.requireHostInLobby(room, hostId);
    if (isPublic && room.playerIds.some((id) => !room.userIdByPlayer.has(id))) {
      throw new Error("every player needs an account to make the room public");
    }
    room.isPublic = isPublic;
    if (isPublic) room.chatEnabled = true;
    this.emitRoomUpdated(room);
  }

  /** Rooms publiques ouvertes (au salon, pas pleines), les plus remplies d'abord. */
  public listPublicRooms(): Array<{ code: string; host: string; players: number; minPlayers: number; maxPlayers: number }> {
    return [...this.rooms.values()]
      .filter((room) => room.isPublic && room.status === "waiting" && !room.starting && room.playerIds.length < room.maxPlayers && room.socketByPlayer.size > 0)
      .map((room) => ({
        code: room.code,
        host: room.hostPlayerId === null ? "?" : (room.pseudoByPlayer.get(room.hostPlayerId) ?? "?"),
        players: room.playerIds.length,
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers,
      }))
      .sort((a, b) => b.players - a.players)
      .slice(0, 50);
  }

  public setPseudo(code: string, playerId: string, pseudo: string): void {
    const room = this.requireRoom(code);
    if (!room.playerIds.includes(playerId)) {
      throw new Error("unknown player for this room");
    }
    room.pseudoByPlayer.set(playerId, uniquePseudo(room, playerId, pseudo));
    this.emitRoomUpdated(room);
  }

  // ---------------------------------------------------------------- parties

  public async startGame(
    code: string,
    playerId: string,
    options: { allowNonHost?: boolean; rulesetPreset?: unknown; ruleset?: unknown } = {},
  ): Promise<GameSession> {
    // Les tests des missions manipulent directement la session renvoyée.
    return (await this.startAnyGame(code, playerId, options)) as GameSession;
  }

  public async startAnyGame(
    code: string,
    playerId: string,
    options: { allowNonHost?: boolean; rulesetPreset?: unknown; ruleset?: unknown } = {},
  ): Promise<AnySession> {
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
    if (room.playerIds.length === DUEL_PLAYERS && preset === undefined && ruleset === undefined) {
      return this.startDuel(room);
    }
    const resolved = resolveRulesetForPlayerCount(room.playerIds.length, ruleset === undefined ? preset : undefined, ruleset, room.pace);

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
      onGameDecided: (summary) => {
        if (room.session === session) this.recordGame(room, "finished", summary);
      },
      onGameFinished: (nextChefId, summary) => this.onGameFinished(room, session, nextChefId, summary),
      onAborted: (_reason, summary) => this.onGameAborted(room, session, summary),
      onTurn: (playerIds, kind) => this.notifyAway(room, playerIds, { kind }),
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

  private async startDuel(room: RoomRecord): Promise<DuelSession> {
    room.starting = true;
    const previousStatus = room.status;
    const session = new DuelSession(room.code, room.playerIds, room.socketByPlayer, this.io, {
      getActivePlayerIds: () => room.playerIds.filter((id) => !room.afkPlayers.has(id)),
      getRoomPayload: () => this.getRoomPayload(room.code),
      onRevealComplete: () => {
        room.status = "playing";
        this.emitRoomUpdated(room);
      },
      onGameDecided: (summary) => {
        if (room.session === session) this.recordGame(room, "finished", summary);
      },
      onGameFinished: (nextChefId, summary) => this.onGameFinished(room, session, nextChefId, summary),
      onAborted: (_reason, summary) => this.onGameAborted(room, session, summary),
      onTurn: (playerIds, kind) => this.notifyAway(room, playerIds, { kind }),
      bridge: this.options.bridgeFactory?.(),
      pythonPath: this.options.pythonPath,
      enginePath: this.options.enginePath,
      engineTimeoutMs: this.options.engineTimeoutMs,
      seed: this.options.duelSeed,
    });
    try {
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
        ruleset: { mode: "duel" },
      };
      this.notifyUsersInGame(room, true);
      await session.start();
      this.emitRoomUpdated(room);
      log.info("duel started", { code: room.code });
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

  public getSession(code: string): AnySession | undefined {
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
        absence: this.absencePayload(room, playerId),
      })),
      code,
      hostPlayerId: room.hostPlayerId,
      targetPlayerCount: room.maxPlayers,
      minPlayers: room.minPlayers,
      maxPlayers: room.maxPlayers,
      status: room.status,
      chatEnabled: room.chatEnabled,
      isPublic: room.isPublic,
      pace: room.pace,
    };
  }

  // ---------------------------------------------------------------- chat et identités

  /** Ajoute un message au chat de la room et le diffuse (texte déjà filtré dans `text`). */
  public addChatMessage(code: string, playerId: string, text: string, original: string, flagged: boolean): ChatMessage {
    const room = this.requireRoom(code);
    if (!room.chatEnabled) {
      throw new Error("chat is disabled in this room");
    }
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

  public liveStats(): { rooms: number; players: number; connectedPlayers: number; gamesInProgress: number } {
    let players = 0;
    let connectedPlayers = 0;
    let gamesInProgress = 0;
    for (const room of this.rooms.values()) {
      players += room.playerIds.length;
      connectedPlayers += room.socketByPlayer.size;
      if (room.session !== undefined) gamesInProgress += 1;
    }
    return { rooms: this.rooms.size, players, connectedPlayers, gamesInProgress };
  }

  // ---------------------------------------------------------------- absences et notifications

  /** Un joueur présent choisit d'attendre un absent : l'abandon est repoussé. */
  public holdForPlayer(code: string, byPlayerId: string, targetId: string): void {
    const room = this.requireRoom(code);
    this.requirePresentPlayer(room, byPlayerId);
    const absence = room.absences.get(targetId);
    if (absence === undefined) {
      throw new Error("this player is not away");
    }
    if (absence.heldBy !== null) {
      throw new Error("the room is already waiting for this player");
    }
    if (absence.holds >= MAX_HOLDS_PER_ABSENCE) {
      throw new Error("the room cannot wait any longer for this player");
    }
    const holdMs = this.options.absenceHoldMs ?? DEFAULT_ABSENCE_HOLD_MS;
    const by = room.pseudoByPlayer.get(byPlayerId) ?? byPlayerId;
    this.startAbsence(room, targetId, holdMs, by);
    this.options.hooks?.onNotify?.(code, targetId, { kind: "absence_hold", by });
  }

  /** Fin de l'attente : l'absent a encore le délai d'avertissement pour revenir (et il est prévenu). */
  public releaseHold(code: string, byPlayerId: string, targetId: string): void {
    const room = this.requireRoom(code);
    this.requirePresentPlayer(room, byPlayerId);
    if (room.absences.get(targetId)?.heldBy == null) {
      throw new Error("nobody is waiting for this player");
    }
    this.startAbsence(room, targetId, this.options.absenceWarningMs ?? DEFAULT_ABSENCE_WARNING_MS, null);
  }

  /** Écran visible ou caché (téléphone verrouillé) : les notifications ne vont qu'aux écrans cachés. */
  public setVisibility(code: string, playerId: string, visible: boolean): void {
    const room = this.rooms.get(code);
    if (room === undefined || !room.playerIds.includes(playerId)) return;
    if (visible) room.hiddenPlayers.delete(playerId);
    else room.hiddenPlayers.add(playerId);
  }

  /** Abonnement Web Push du joueur, gardé en mémoire le temps de la room. null : désabonnement. */
  public setPushSubscription(code: string, playerId: string, subscription: PushSubscriptionData | null): void {
    const room = this.requireRoom(code);
    if (!room.playerIds.includes(playerId)) {
      throw new Error("unknown player for this room");
    }
    if (subscription === null) room.pushByPlayer.delete(playerId);
    else room.pushByPlayer.set(playerId, subscription);
  }

  public getPushSubscription(code: string, playerId: string): PushSubscriptionData | undefined {
    return this.rooms.get(code)?.pushByPlayer.get(playerId);
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

  private onGameFinished(room: RoomRecord, session: AnySession, nextChefId: string | null, summary: GameSummary): void {
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

  private onGameAborted(room: RoomRecord, session: AnySession, summary: GameSummary): void {
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
      await this.startAnyGame(room.code, connected[0] as string, { allowNonHost: true });
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
    room.hiddenPlayers.delete(playerId);
    room.pushByPlayer.delete(playerId);
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
    // Room abandonnée en pleine partie : la partie reste tracée, comme annulée.
    if (room.session !== undefined && room.currentGame !== undefined) {
      this.recordGame(room, "aborted", room.session.summary());
    }
    room.session?.dispose();
    room.session = undefined;
    this.rooms.delete(room.code);
    log.info("room deleted", { code: room.code });
  }

  private scheduleAfk(room: RoomRecord, playerId: string): void {
    if (this.inGame(room)) {
      this.startAbsence(room, playerId, this.options.afkTimeoutMs ?? DEFAULT_AFK_TIMEOUT_MS, null);
      return;
    }
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
    this.clearAbsence(room, playerId);
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
    this.clearAbsence(room, playerId);
  }

  private inGame(room: RoomRecord): boolean {
    return room.session !== undefined && room.status !== "waiting" && room.status !== "finished";
  }

  private requirePresentPlayer(room: RoomRecord, playerId: string): void {
    if (!room.playerIds.includes(playerId) || !room.socketByPlayer.has(playerId) || room.afkPlayers.has(playerId)) {
      throw new Error("unknown player for this room");
    }
    if (!this.inGame(room)) {
      throw new Error("only possible during a game");
    }
  }

  /** (Re)lance le compte à rebours d'un absent : avertissement avant la fin, puis abandon. */
  private startAbsence(room: RoomRecord, playerId: string, durationMs: number, heldBy: string | null): void {
    const previous = room.absences.get(playerId);
    previous?.timers.forEach(clearTimeout);
    const now = Date.now();
    const absence: Absence = { since: previous?.since ?? now, kickAt: now + durationMs, heldBy, holds: (previous?.holds ?? 0) + (heldBy === null ? 0 : 1), timers: [] };
    const warningMs = this.options.absenceWarningMs ?? DEFAULT_ABSENCE_WARNING_MS;
    const stillAway = () => this.rooms.get(room.code) === room && room.absences.get(playerId) === absence && !room.socketByPlayer.has(playerId);
    const warn = setTimeout(() => {
      if (stillAway()) {
        this.options.hooks?.onNotify?.(room.code, playerId, { kind: "absence_warning", secondsLeft: Math.round(Math.min(warningMs, durationMs) / 1000) });
      }
    }, Math.max(0, durationMs - warningMs));
    const kick = setTimeout(() => {
      if (!stillAway() || !room.playerIds.includes(playerId)) return;
      room.absences.delete(playerId);
      this.markAfk(room, playerId);
    }, durationMs);
    warn.unref();
    kick.unref();
    absence.timers.push(warn, kick);
    room.absences.set(playerId, absence);
    this.emitRoomUpdated(room);
  }

  private clearAbsence(room: RoomRecord, playerId: string): void {
    const absence = room.absences.get(playerId);
    if (absence === undefined) return;
    absence.timers.forEach(clearTimeout);
    room.absences.delete(playerId);
  }

  private absencePayload(room: RoomRecord, playerId: string): PlayerSummary["absence"] {
    const absence = room.absences.get(playerId);
    if (absence === undefined) return null;
    const now = Date.now();
    return { kickInMs: Math.max(0, absence.kickAt - now), awayForMs: now - absence.since, heldBy: absence.heldBy };
  }

  /** Prévient ceux qui ne regardent pas le jeu : écran caché ou déconnectés (mais pas abandonnés). */
  private notifyAway(room: RoomRecord, playerIds: string[], notification: PlayerNotification): void {
    const notify = this.options.hooks?.onNotify;
    if (notify === undefined) return;
    for (const playerId of playerIds) {
      const away = !room.socketByPlayer.has(playerId) || room.hiddenPlayers.has(playerId);
      if (away && !room.afkPlayers.has(playerId) && room.pushByPlayer.has(playerId)) {
        notify(room.code, playerId, notification);
      }
    }
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
    for (const playerId of [...room.absences.keys()]) {
      this.clearAbsence(room, playerId);
    }
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

  private runSessionTask(room: RoomRecord, task: (session: AnySession) => Promise<void>): void {
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
      // 8 caractères sur 32 (sans 0/O, 1/I) : environ 10^12 codes, impossibles à deviner au hasard.
      const code = Array.from(crypto.randomBytes(8), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
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
