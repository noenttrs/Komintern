import { Server } from "socket.io";

import { SERVER_EVENTS } from "./events";
import { GameSession } from "./GameSession";
import { RULESET_PRESETS, resolveRulesetForPlayerCount } from "./rulesets";
import { PlayerSummary, RoomState } from "./types";

type RoomRecord = {
  state: RoomState;
  socketByPlayer: Map<string, string>;
  playerByUid: Map<string, string>;
  pseudoByPlayer: Map<string, string>;
  afkTimers: Map<string, NodeJS.Timeout>;
  afkPlayers: Set<string>;
  configuredRulesetPreset?: string;
  configuredRuleset?: unknown;
};

type JoinRoomResult = {
  roomState: RoomState;
  resolvedPlayerId: string;
};

type StartGameOptions = {
  allowNonHost?: boolean;
  rulesetPreset?: string;
  ruleset?: unknown;
};

const MIN_ROOM_PLAYERS = 3;
const MAX_ROOM_PLAYERS = 11;
const AFK_TIMEOUT_MS = 60_000;

export class RoomManager {
  private readonly io: Server;
  private readonly pythonPath: string;
  private readonly enginePath: string;

  private readonly rooms = new Map<string, RoomRecord>();
  private readonly sessions = new Map<string, GameSession>();
  private readonly persistedCursor = new Map<string, number>();
  private readonly replayRequests = new Map<string, Set<string>>();

  public constructor(io: Server, pythonPath: string, enginePath: string) {
    this.io = io;
    this.pythonPath = pythonPath;
    this.enginePath = enginePath;
  }

  public createRoom(roomId: string): RoomState {
    const existing = this.rooms.get(roomId);
    if (existing !== undefined) {
      return existing.state;
    }

    const roomState: RoomState = {
      roomId,
      playerIds: [],
      hostPlayerId: null,
      chefCursor: this.persistedCursor.get(roomId) ?? 0,
      targetPlayerCount: 5,
      status: "waiting",
    };

    this.rooms.set(roomId, {
      state: roomState,
      socketByPlayer: new Map<string, string>(),
      playerByUid: new Map<string, string>(),
      pseudoByPlayer: new Map<string, string>(),
      afkTimers: new Map<string, NodeJS.Timeout>(),
      afkPlayers: new Set<string>(),
      configuredRulesetPreset: undefined,
      configuredRuleset: undefined,
    });

    return roomState;
  }

  public hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  public joinRoom(
    roomId: string,
    playerId: string,
    socketId: string,
    playerUid?: string,
    rulesetPreset?: string,
    ruleset?: unknown,
  ): JoinRoomResult {
    const roomState = this.createRoom(roomId);
    const roomRecord = this.rooms.get(roomId);
    if (roomRecord === undefined) {
      throw new Error("room creation failed");
    }

    if (roomState.status === "waiting" && roomState.playerIds.length === 0) {
      if (ruleset !== undefined) {
        const customPlayerCount = readPlayerCountFromRuleset(ruleset);
        if (customPlayerCount < MIN_ROOM_PLAYERS || customPlayerCount > MAX_ROOM_PLAYERS) {
          throw new Error("custom ruleset player_count must be between 3 and 11");
        }
        roomState.targetPlayerCount = customPlayerCount;
        roomRecord.configuredRuleset = ruleset;
        roomRecord.configuredRulesetPreset = undefined;
      } else if (rulesetPreset !== undefined && rulesetPreset !== "") {
        const presetName = rulesetPreset.toUpperCase();
        const preset = RULESET_PRESETS[presetName as keyof typeof RULESET_PRESETS];
        if (preset === undefined) {
          throw new Error("unknown ruleset preset");
        }
        roomState.targetPlayerCount = preset.playerCount;
        roomRecord.configuredRulesetPreset = presetName;
        roomRecord.configuredRuleset = undefined;
      } else {
        roomState.targetPlayerCount = 5;
        roomRecord.configuredRulesetPreset = undefined;
        roomRecord.configuredRuleset = undefined;
      }
    }

    const mappedPlayerId =
      playerUid !== undefined && playerUid !== ""
        ? roomRecord.playerByUid.get(playerUid)
        : undefined;
    const resolvedPlayerId = mappedPlayerId ?? playerId;

    if (roomState.status === "playing") {
      if (!roomState.playerIds.includes(resolvedPlayerId)) {
        throw new Error("game already started for this room");
      }

      roomRecord.socketByPlayer.set(resolvedPlayerId, socketId);
      this.clearAfkState(roomRecord, resolvedPlayerId);
      if (playerUid !== undefined && playerUid !== "") {
        roomRecord.playerByUid.set(playerUid, resolvedPlayerId);
      }

      const session = this.sessions.get(roomId);
      if (session !== undefined) {
        session.updatePlayerSocket(resolvedPlayerId, socketId);
      }

      return { roomState, resolvedPlayerId };
    }

    if (roomState.status === "finished") {
      if (!roomState.playerIds.includes(resolvedPlayerId)) {
        throw new Error("room is finished; wait for the next replay");
      }

      roomRecord.socketByPlayer.set(resolvedPlayerId, socketId);
      this.clearAfkState(roomRecord, resolvedPlayerId);
      if (playerUid !== undefined && playerUid !== "") {
        roomRecord.playerByUid.set(playerUid, resolvedPlayerId);
      }

      const session = this.sessions.get(roomId);
      if (session !== undefined) {
        session.updatePlayerSocket(resolvedPlayerId, socketId);
      }

      return { roomState, resolvedPlayerId };
    }

    if (!roomState.playerIds.includes(resolvedPlayerId)) {
      if (roomState.playerIds.length >= roomState.targetPlayerCount) {
        throw new Error("room is full");
      }
      roomState.playerIds.push(resolvedPlayerId);
      if (roomState.hostPlayerId === null) {
        roomState.hostPlayerId = resolvedPlayerId;
      }
    }

    roomRecord.socketByPlayer.set(resolvedPlayerId, socketId);
    this.clearAfkState(roomRecord, resolvedPlayerId);
    if (playerUid !== undefined && playerUid !== "") {
      roomRecord.playerByUid.set(playerUid, resolvedPlayerId);
    }

    if (!roomRecord.pseudoByPlayer.has(resolvedPlayerId)) {
      roomRecord.pseudoByPlayer.set(resolvedPlayerId, resolvedPlayerId);
    }

    const session = this.sessions.get(roomId);
    if (session !== undefined) {
      session.updatePlayerSocket(resolvedPlayerId, socketId);
    }

    return { roomState, resolvedPlayerId };
  }

  public requestReplay(roomId: string, playerId: string): { shouldStart: boolean } {
    const roomRecord = this.rooms.get(roomId);
    if (roomRecord === undefined) {
      throw new Error("room not found");
    }

    if (roomRecord.state.status !== "finished") {
      throw new Error("replay is only available after a game finishes");
    }

    if (!roomRecord.state.playerIds.includes(playerId)) {
      throw new Error("unknown player for this room");
    }

    const requests = this.replayRequests.get(roomId) ?? new Set<string>();
    requests.add(playerId);
    this.replayRequests.set(roomId, requests);

    const connectedPlayerIds = roomRecord.state.playerIds.filter((id) => {
      const socketId = roomRecord.socketByPlayer.get(id);
      return socketId !== undefined && this.io.sockets.sockets.has(socketId);
    });

    // If nobody is connected, never auto-start replay.
    if (connectedPlayerIds.length === 0) {
      return { shouldStart: false };
    }

    const shouldStart = connectedPlayerIds.every((id) => requests.has(id));
    if (shouldStart) {
      this.replayRequests.delete(roomId);
    }

    return { shouldStart };
  }

  public async startGame(roomId: string, playerId: string, options: StartGameOptions = {}): Promise<GameSession> {
    const roomRecord = this.rooms.get(roomId);
    if (roomRecord === undefined) {
      throw new Error("room not found");
    }

    const existingSession = this.sessions.get(roomId);
    if (existingSession !== undefined) {
      return existingSession;
    }

    const effectivePreset = options.rulesetPreset ?? roomRecord.configuredRulesetPreset;
    const effectiveRuleset = options.ruleset ?? roomRecord.configuredRuleset;

    const resolvedRuleset = resolveRulesetForPlayerCount(
      roomRecord.state.playerIds.length,
      effectivePreset,
      effectiveRuleset,
    );

    roomRecord.configuredRulesetPreset = effectivePreset;
    roomRecord.configuredRuleset = effectiveRuleset;

    if (!options.allowNonHost && roomRecord.state.hostPlayerId !== playerId) {
      throw new Error("only the host can start the game");
    }

    if (roomRecord.state.status !== "waiting" && roomRecord.state.status !== "finished") {
      throw new Error("game has already started for this room");
    }

    if (roomRecord.state.hostPlayerId === null) {
      throw new Error("room host is missing");
    }

    const chefCursor = this.persistedCursor.get(roomId) ?? 0;
    const session = new GameSession(
      roomId,
      roomRecord.state.playerIds,
      chefCursor,
      roomRecord.socketByPlayer,
      this.io,
      {
        pythonPath: this.pythonPath,
        enginePath: this.enginePath,
        ruleset: resolvedRuleset,
        hostPlayerId: roomRecord.state.hostPlayerId,
        persistCursor: (id, cursor) => {
          this.persistCursor(id, cursor);
          const room = this.rooms.get(id);
          if (room !== undefined) {
            room.state.status = "finished";
            room.state.chefCursor = cursor;
          }
        },
        onRevealComplete: (id) => {
          const room = this.rooms.get(id);
          if (room !== undefined) {
            room.state.status = "playing";
          }
        },
        onGameOver: (id) => {
          this.sessions.delete(id);
        },
        getActivePlayerIds: () => this.getActivePlayerIds(roomId),
        getPlayerSummaries: () => this.getRoomUpdatedPayload(roomId).players,
      },
    );

    try {
      roomRecord.state.chefCursor = chefCursor;
      this.replayRequests.delete(roomId);
      await session.start();
      roomRecord.state.status = "table_order";
      this.sessions.set(roomId, session);
    } catch (error) {
      session.dispose();
      roomRecord.state.status = "waiting";
      this.sessions.delete(roomId);
      throw error;
    }

    return session;
  }

  public getSession(roomId: string): GameSession | undefined {
    return this.sessions.get(roomId);
  }

  public persistCursor(roomId: string, cursor: number): void {
    this.persistedCursor.set(roomId, cursor);
  }

  public leaveRoom(roomId: string, playerId: string): RoomState | null {
    const roomRecord = this.rooms.get(roomId);
    if (roomRecord === undefined) {
      throw new Error("room not found");
    }

    const playerIndex = roomRecord.state.playerIds.indexOf(playerId);
    if (playerIndex !== -1) {
      roomRecord.state.playerIds.splice(playerIndex, 1);
    }
    roomRecord.socketByPlayer.delete(playerId);
    roomRecord.pseudoByPlayer.delete(playerId);
    roomRecord.playerByUid.forEach((mappedPlayerId, uid) => {
      if (mappedPlayerId === playerId) {
        roomRecord.playerByUid.delete(uid);
      }
    });
    this.clearAfkState(roomRecord, playerId);

    const replayRequests = this.replayRequests.get(roomId);
    if (replayRequests !== undefined) {
      replayRequests.delete(playerId);
      if (replayRequests.size === 0) {
        this.replayRequests.delete(roomId);
      }
    }

    // Handle host reassignment
    if (roomRecord.state.hostPlayerId === playerId) {
      if (roomRecord.state.playerIds.length > 0) {
        roomRecord.state.hostPlayerId = roomRecord.state.playerIds[0];
      } else {
        roomRecord.state.hostPlayerId = null;
      }
    }

    // If room is empty, clean up
    if (roomRecord.state.playerIds.length === 0) {
      this.disposeSession(roomId);
      this.rooms.delete(roomId);
      return null;
    }

    const session = this.sessions.get(roomId);
    if (session !== undefined) {
      void session.handleRosterChange();
    }

    return roomRecord.state;
  }

  public handleDisconnect(roomId: string, playerId: string): RoomState | null {
    const roomRecord = this.rooms.get(roomId);
    if (roomRecord === undefined) {
      return null;
    }

    roomRecord.socketByPlayer.delete(playerId);

    this.scheduleAfk(roomId, playerId);

    return roomRecord.state;
  }

  public setPseudo(roomId: string, playerId: string, pseudo: string): RoomState {
    const roomRecord = this.rooms.get(roomId);
    if (roomRecord === undefined) {
      throw new Error("room not found");
    }

    if (!roomRecord.state.playerIds.includes(playerId)) {
      throw new Error("unknown player for this room");
    }

    roomRecord.pseudoByPlayer.set(playerId, pseudo);
    return roomRecord.state;
  }

  public getRoomUpdatedPayload(roomId: string): {
    players: PlayerSummary[];
    code: string;
    hostPlayerId: string | null;
    targetPlayerCount: number;
  } {
    const roomRecord = this.rooms.get(roomId);
    if (roomRecord === undefined) {
      throw new Error("room not found");
    }

    return {
      players: roomRecord.state.playerIds.map((playerId) => ({
        playerId,
        pseudo: roomRecord.pseudoByPlayer.get(playerId) ?? playerId,
        isHost: roomRecord.state.hostPlayerId === playerId,
        isAfk: roomRecord.afkPlayers.has(playerId),
      })),
      code: roomId,
      hostPlayerId: roomRecord.state.hostPlayerId,
      targetPlayerCount: roomRecord.state.targetPlayerCount,
    };
  }

  public getActivePlayerIds(roomId: string): string[] {
    const roomRecord = this.rooms.get(roomId);
    if (roomRecord === undefined) {
      return [];
    }

    return roomRecord.state.playerIds.filter((playerId) => !roomRecord.afkPlayers.has(playerId));
  }

  public markPlayerAfk(roomId: string, playerId: string): void {
    const roomRecord = this.rooms.get(roomId);
    if (roomRecord === undefined) {
      return;
    }

    if (!roomRecord.state.playerIds.includes(playerId)) {
      return;
    }

    roomRecord.afkPlayers.add(playerId);
    roomRecord.afkTimers.delete(playerId);
    this.io.to(roomId).emit(SERVER_EVENTS.PLAYER_AFK, { playerId });

    const session = this.sessions.get(roomId);
    if (session !== undefined) {
      void session.handleRosterChange();
    }
  }

  private scheduleAfk(roomId: string, playerId: string): void {
    const roomRecord = this.rooms.get(roomId);
    if (roomRecord === undefined) {
      return;
    }

    const existingTimer = roomRecord.afkTimers.get(playerId);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      const latestRoom = this.rooms.get(roomId);
      if (latestRoom === undefined) {
        return;
      }

      if (latestRoom.socketByPlayer.has(playerId)) {
        return;
      }

      this.markPlayerAfk(roomId, playerId);
    }, AFK_TIMEOUT_MS);

    roomRecord.afkTimers.set(playerId, timer);
  }

  private clearAfkState(roomRecord: RoomRecord, playerId: string): void {
    const timer = roomRecord.afkTimers.get(playerId);
    if (timer !== undefined) {
      clearTimeout(timer);
      roomRecord.afkTimers.delete(playerId);
    }

    roomRecord.afkPlayers.delete(playerId);
  }

  public disposeAll(): void {
    for (const roomId of [...this.sessions.keys()]) {
      this.disposeSession(roomId);
    }
  }

  private disposeSession(roomId: string): void {
    const session = this.sessions.get(roomId);
    if (session === undefined) {
      return;
    }

    session.dispose();
    this.sessions.delete(roomId);
  }
}

function readPlayerCountFromRuleset(ruleset: unknown): number {
  if (typeof ruleset !== "object" || ruleset === null || Array.isArray(ruleset)) {
    throw new Error("ruleset must be an object");
  }

  const payload = ruleset as Record<string, unknown>;
  const playerCount = payload.player_count;
  if (!Number.isInteger(playerCount)) {
    throw new Error("ruleset.player_count must be an integer");
  }
  return playerCount as number;
}
