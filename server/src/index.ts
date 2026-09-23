import path from "path";
import crypto from "crypto";

import { createServer } from "http";
import { Server, Socket } from "socket.io";

import { CLIENT_EVENTS, SERVER_EVENTS } from "./events";
import { RoomManager } from "./RoomManager";
import { ConfidenceVote, MissionVote } from "./types";

type SocketContext = {
  roomId: string;
  playerId: string;
};

type JoinPayload = {
  code?: string;
  roomId?: string;
  playerId?: string;
  pseudo?: string;
  playerUid?: string;
  ruleset_preset?: string;
  ruleset?: Record<string, unknown>;
};

type CreateRoomPayload = {
  code?: string;
  room_name?: string;
  ruleset?: Record<string, unknown>;
  ruleset_preset?: string;
  pseudo?: string;
  playerUid?: string;
};

type ProposeTeamPayload = {
  team: string[];
};

type StartGamePayload = {
  ruleset_preset?: string;
  ruleset?: Record<string, unknown>;
};

type ConfirmRoleRevealPayload = Record<string, never>;

type ConfidenceVotePayload = {
  vote: ConfidenceVote;
};

type MissionVotePayload = {
  vote: MissionVote;
};

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const pythonPath = process.env.PYTHON_PATH ?? "python3";
const enginePath = process.env.ENGINE_PATH ?? path.resolve(process.cwd(), "../gameengine_entry.py");
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "*")
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);
const RATE_LIMIT_MAX_EVENTS = Number(process.env.SOCKET_RATE_LIMIT_MAX_EVENTS ?? 80);
const RATE_LIMIT_WINDOW_MS = Number(process.env.SOCKET_RATE_LIMIT_WINDOW_MS ?? 10_000);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.length === 1 && allowedOrigins[0] === "*" ? "*" : allowedOrigins,
  },
});

const roomManager = new RoomManager(io, pythonPath, enginePath);
const socketContext = new Map<string, SocketContext>();
const pendingPseudoBySocket = new Map<string, string>();
const rateBySocket = new Map<string, { count: number; windowStart: number }>();

io.on("connection", (socket: Socket) => {
  console.log(`socket connected: ${socket.id}`);

  socket.use((_, next) => {
    const now = Date.now();
    const current = rateBySocket.get(socket.id);
    if (current === undefined || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateBySocket.set(socket.id, { count: 1, windowStart: now });
      next();
      return;
    }

    if (current.count >= RATE_LIMIT_MAX_EVENTS) {
      next(new Error("rate limit exceeded"));
      return;
    }

    current.count += 1;
    next();
  });

  socket.on(CLIENT_EVENTS.SET_PSEUDO, async (payload: { pseudo: string }) => {
    try {
      if (typeof payload?.pseudo !== "string" || payload.pseudo.trim().length === 0) {
        throw new Error("pseudo must be a non-empty string");
      }

      pendingPseudoBySocket.set(socket.id, payload.pseudo.trim());

      const context = socketContext.get(socket.id);
      if (context === undefined) {
        return;
      }

      roomManager.setPseudo(context.roomId, context.playerId, payload.pseudo.trim());
      emitRoomUpdated(context.roomId);
    } catch (error) {
      emitSocketError(socket, error);
    }
  });

  socket.on(CLIENT_EVENTS.CREATE_ROOM, async (payload: CreateRoomPayload) => {
    try {
      const preferredCode = normalizePreferredRoomCode(payload?.code ?? payload?.room_name);
      const roomId = preferredCode ?? generateRoomCode();
      if (roomManager.hasRoom(roomId)) {
        throw new Error("room code already exists");
      }

      const resolvedPlayerId = socket.id;
      const { roomState, resolvedPlayerId: joinedPlayerId } = roomManager.joinRoom(
        roomId,
        resolvedPlayerId,
        socket.id,
        payload.playerUid,
        payload.ruleset_preset,
        payload.ruleset,
      );

      await socket.join(roomId);
      socketContext.set(socket.id, {
        roomId,
        playerId: joinedPlayerId,
      });

      socket.emit(SERVER_EVENTS.ROOM_UPDATED, {
        ...roomManager.getRoomUpdatedPayload(roomId),
        playerId: joinedPlayerId,
      });
      socket.to(roomId).emit(SERVER_EVENTS.ROOM_UPDATED, roomManager.getRoomUpdatedPayload(roomId));

      const pseudo = payload?.pseudo ?? pendingPseudoBySocket.get(socket.id);
      if (typeof pseudo === "string" && pseudo.trim().length > 0) {
        roomManager.setPseudo(roomId, joinedPlayerId, pseudo.trim());
        emitRoomUpdated(roomId);
      }

      const activeSession = roomManager.getSession(roomId);
      if (activeSession !== undefined) {
        await activeSession.syncPlayer(joinedPlayerId);
      }
    } catch (error) {
      emitSocketError(socket, error);
    }
  });

  socket.on(CLIENT_EVENTS.JOIN_ROOM, async (payload: JoinPayload) => {
    try {
      const roomCode = payload?.code ?? payload?.roomId;
      if (!roomCode) {
        throw new Error("code is required");
      }

      const requestedPlayerId = payload?.playerId ?? socket.id;

      const { roomState, resolvedPlayerId } = roomManager.joinRoom(
        roomCode,
        requestedPlayerId,
        socket.id,
        payload.playerUid,
        payload.ruleset_preset,
        payload.ruleset,
      );
      await socket.join(roomCode);
      socketContext.set(socket.id, {
        roomId: roomCode,
        playerId: resolvedPlayerId,
      });

      socket.emit(SERVER_EVENTS.ROOM_UPDATED, {
        ...roomManager.getRoomUpdatedPayload(roomCode),
        playerId: resolvedPlayerId,
      });
      socket.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATED, roomManager.getRoomUpdatedPayload(roomCode));

      const pseudo = payload?.pseudo ?? pendingPseudoBySocket.get(socket.id);
      if (typeof pseudo === "string" && pseudo.trim().length > 0) {
        roomManager.setPseudo(roomCode, resolvedPlayerId, pseudo.trim());
        emitRoomUpdated(roomCode);
      }

      const activeSession = roomManager.getSession(roomCode);
      if (activeSession !== undefined) {
        await activeSession.syncPlayer(resolvedPlayerId);
      }
    } catch (error) {
      emitSocketError(socket, error);
    }
  });

  socket.on(CLIENT_EVENTS.START_GAME, async (payload: StartGamePayload) => {
    try {
      const context = requireSocketContext(socket.id);
      const session = await roomManager.startGame(context.roomId, context.playerId, {
        rulesetPreset: payload?.ruleset_preset,
        ruleset: payload?.ruleset,
      });
      await session.syncPlayer(context.playerId);
    } catch (error) {
      emitSocketError(socket, error);
    }
  });

  socket.on(CLIENT_EVENTS.ROLE_CONFIRMED, async (_payload: ConfirmRoleRevealPayload) => {
    try {
      const context = requireSocketContext(socket.id);
      const session = requireSession(context.roomId);
      await session.confirmRoleReveal(context.playerId);
    } catch (error) {
      emitSocketError(socket, error);
    }
  });

  socket.on(CLIENT_EVENTS.TABLE_ORDER_TAP, async () => {
    try {
      const context = requireSocketContext(socket.id);
      const session = requireSession(context.roomId);
      await session.handleTableOrderTap(context.playerId);
    } catch (error) {
      emitSocketError(socket, error, "invalid_table_order_tap");
    }
  });

  socket.on(CLIENT_EVENTS.TABLE_ORDER_ADJUST, async (payload: { position: number }) => {
    try {
      const context = requireSocketContext(socket.id);
      const session = requireSession(context.roomId);
      await session.handleTableOrderAdjust(context.playerId, payload?.position);
    } catch (error) {
      emitSocketError(socket, error, "invalid_table_order_adjust");
    }
  });

  socket.on(CLIENT_EVENTS.TABLE_ORDER_CONFIRMED, async () => {
    try {
      const context = requireSocketContext(socket.id);
      const session = requireSession(context.roomId);
      await session.confirmTableOrder(context.playerId);
    } catch (error) {
      emitSocketError(socket, error, "invalid_table_order_confirmation");
    }
  });

  socket.on(CLIENT_EVENTS.TABLE_ORDER_BACK, async () => {
    try {
      const context = requireSocketContext(socket.id);
      const session = requireSession(context.roomId);
      await session.resetTableOrder(context.playerId);
    } catch (error) {
      emitSocketError(socket, error, "invalid_table_order_back");
    }
  });

  socket.on(CLIENT_EVENTS.PROPOSE_TEAM, async (payload: ProposeTeamPayload) => {
    try {
      const context = requireSocketContext(socket.id);
      const session = requireSession(context.roomId);

      if (!Array.isArray(payload?.team)) {
        throw new Error("team must be an array of player ids");
      }

      await session.handleProposeTeam(context.playerId, payload.team);
    } catch (error) {
      emitSocketError(socket, error, "invalid_team_proposal");
    }
  });

  socket.on(CLIENT_EVENTS.CONFIDENCE_VOTE, async (payload: ConfidenceVotePayload) => {
    try {
      const context = requireSocketContext(socket.id);
      const session = requireSession(context.roomId);
      const vote = payload?.vote;
      if (vote !== "yes" && vote !== "no") {
        throw new Error("invalid confidence vote");
      }

      await session.handleConfidenceVote(context.playerId, vote);
    } catch (error) {
      emitSocketError(socket, error, "invalid_confidence_vote");
    }
  });

  socket.on(CLIENT_EVENTS.CONFIDENCE_RESULT_CONFIRMED, async () => {
    try {
      const context = requireSocketContext(socket.id);
      const session = requireSession(context.roomId);
      await session.confirmConfidenceResult(context.playerId);
    } catch (error) {
      emitSocketError(socket, error, "invalid_confidence_result_confirmation");
    }
  });

  socket.on(CLIENT_EVENTS.MISSION_VOTE, async (payload: MissionVotePayload) => {
    try {
      const context = requireSocketContext(socket.id);
      const session = requireSession(context.roomId);
      const vote = payload?.vote;
      if (vote !== "nazi" && vote !== "communist") {
        throw new Error("invalid mission vote");
      }

      await session.handleMissionVote(context.playerId, vote);
    } catch (error) {
      emitSocketError(socket, error, "invalid_mission_vote");
    }
  });

  socket.on(CLIENT_EVENTS.MISSION_RESULT_CONFIRMED, async () => {
    try {
      const context = requireSocketContext(socket.id);
      const session = requireSession(context.roomId);
      await session.confirmMissionResult(context.playerId);
    } catch (error) {
      emitSocketError(socket, error, "invalid_mission_result_confirmation");
    }
  });

  socket.on(CLIENT_EVENTS.END_GAME_CONFIRMED, async () => {
    try {
      const context = requireSocketContext(socket.id);
      const session = requireSession(context.roomId);
      await session.confirmEndGame(context.playerId);
    } catch (error) {
      emitSocketError(socket, error, "invalid_end_game_confirmation");
    }
  });

  socket.on(CLIENT_EVENTS.REPLAY_CHOICE, async (payload: { choice: "replay" | "quit" }) => {
    try {
      const context = requireSocketContext(socket.id);
      if (payload?.choice === "quit") {
        roomManager.leaveRoom(context.roomId, context.playerId);
        socketContext.delete(socket.id);
        await socket.leave(context.roomId);
        return;
      }

      const replayState = roomManager.requestReplay(context.roomId, context.playerId);

      if (replayState.shouldStart) {
        const session = await roomManager.startGame(context.roomId, context.playerId, { allowNonHost: true });
        await session.syncPlayer(context.playerId);
      }
    } catch (error) {
      emitSocketError(socket, error, "invalid_replay_choice");
    }
  });

  socket.on(CLIENT_EVENTS.LEAVE_ROOM, async () => {
    try {
      const context = requireSocketContext(socket.id);
      const updatedRoomState = roomManager.leaveRoom(context.roomId, context.playerId);
      socketContext.delete(socket.id);
      
      if (updatedRoomState !== null) {
        socket.to(context.roomId).emit(SERVER_EVENTS.PLAYER_LEFT, {
          playerId: context.playerId,
          roomState: updatedRoomState,
        });
      }
      
      await socket.leave(context.roomId);
    } catch (error) {
      emitSocketError(socket, error, "invalid_leave_room");
    }
  });

  socket.on("disconnect", () => {
    console.log(`socket disconnected: ${socket.id}`);
    const context = socketContext.get(socket.id);
    socketContext.delete(socket.id);
    pendingPseudoBySocket.delete(socket.id);
    rateBySocket.delete(socket.id);

    if (context !== undefined) {
      const updatedRoomState = roomManager.handleDisconnect(context.roomId, context.playerId);
      if (updatedRoomState !== null) {
        emitRoomUpdated(context.roomId);
      }
    }
  });
});

httpServer.listen(port, host, () => {
  console.log(`websocket server listening on ${host}:${port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`received ${signal}, shutting down`);
  roomManager.disposeAll();
  io.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

// Une erreur non rattrapée laisse l'état en mémoire incohérent : on journalise puis on
// quitte avec un code d'erreur pour que Docker (restart: always) relance un process sain.
process.on("uncaughtException", (error) => {
  console.error("uncaught exception, exiting:", error);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("unhandled rejection, exiting:", reason);
  process.exit(1);
});

function requireSocketContext(socketId: string): SocketContext {
  const context = socketContext.get(socketId);
  if (context === undefined) {
    throw new Error("not joined to a room");
  }
  return context;
}

function requireSession(roomId: string) {
  const session = roomManager.getSession(roomId);
  if (session === undefined) {
    throw new Error("game session is not running for room");
  }
  return session;
}

function emitRoomUpdated(roomId: string): void {
  const payload = roomManager.getRoomUpdatedPayload(roomId);
  io.to(roomId).emit(SERVER_EVENTS.ROOM_UPDATED, payload);
}

function generateRoomCode(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function normalizePreferredRoomCode(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }

  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");

  if (normalized.length === 0) {
    return undefined;
  }

  if (!/^[A-Z0-9_-]{3,24}$/.test(normalized)) {
    throw new Error("room code must contain only A-Z, 0-9, _, - and be 3-24 chars long");
  }

  return normalized;
}

function emitSocketError(socket: Socket, error: unknown, code = "invalid_action"): void {
  const message = error instanceof Error ? error.message : "unknown server error";
  socket.emit(SERVER_EVENTS.ERROR, { code, message });
}
