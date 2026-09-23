import { createServer } from "http";
import type { Server as HttpServer } from "http";

import { Server } from "socket.io";
import type { Socket } from "socket.io";

import { CLIENT_EVENTS, SERVER_EVENTS } from "./events";
import type { GameSession } from "./GameSession";
import { log } from "./logger";
import { EngineError } from "./PythonBridge";
import { RoomManager } from "./RoomManager";
import type { RoomManagerOptions } from "./RoomManager";
import {
  asRecord,
  parseConfidenceVote,
  parseMissionVote,
  parseOptionalPlayerUid,
  parseOptionalPseudo,
  parseOptionalRoomCode,
  parsePosition,
  parsePseudo,
  parseReplayChoice,
  parseRoomCode,
  parseTeam,
} from "./validation";

export type AppOptions = RoomManagerOptions & {
  allowedOrigins: string[];
  rateLimitMaxEvents: number;
  rateLimitWindowMs: number;
};

export type KominternApp = {
  httpServer: HttpServer;
  io: Server;
  roomManager: RoomManager;
  close: () => Promise<void>;
};

type SocketContext = { roomId: string; playerId: string };

/** Erreurs dont le message peut être montré tel quel au joueur (règles, validation). */
function publicMessage(error: unknown): string {
  if (error instanceof EngineError) {
    return error.message;
  }
  if (error instanceof Error && error.name === "Error") {
    return error.message;
  }
  return "internal server error";
}

export function createKominternApp(options: AppOptions): KominternApp {
  const httpServer = createServer();
  const allowAll = options.allowedOrigins.length === 0 || options.allowedOrigins.includes("*");
  const io = new Server(httpServer, {
    cors: { origin: allowAll ? "*" : options.allowedOrigins },
    maxHttpBufferSize: 16_000,
    // `cors` ne couvre que le polling HTTP : on vérifie aussi l'Origin des WebSockets.
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(null, allowAll || origin === undefined || options.allowedOrigins.includes(origin));
    },
  });

  const roomManager = new RoomManager(io, options);
  const socketContext = new Map<string, SocketContext>();
  const pendingPseudoBySocket = new Map<string, string>();

  function requireContext(socket: Socket): SocketContext {
    const context = socketContext.get(socket.id);
    if (context === undefined) {
      throw new Error("not joined to a room");
    }
    return context;
  }

  function requireSession(roomId: string): GameSession {
    const session = roomManager.getSession(roomId);
    if (session === undefined) {
      throw new Error("no game is running in this room");
    }
    return session;
  }

  function emitError(socket: Socket, code: string, error: unknown): void {
    const message = publicMessage(error);
    if (message === "internal server error") {
      log.error("socket handler failed", { code, socketId: socket.id, error });
    } else {
      log.debug("socket action rejected", { code, socketId: socket.id, message });
    }
    socket.emit(SERVER_EVENTS.ERROR, { code, message });
  }

  /** Enveloppe commune : payload validé en `unknown`, erreurs journalisées et renvoyées. */
  function on(socket: Socket, event: string, errorCode: string, handler: (payload: Record<string, unknown>) => Promise<void> | void): void {
    socket.on(event, async (payload: unknown) => {
      try {
        await handler(asRecord(payload));
      } catch (error) {
        emitError(socket, errorCode, error);
      }
    });
  }

  async function detachFromCurrentRoom(socket: Socket): Promise<void> {
    const previous = socketContext.get(socket.id);
    if (previous === undefined) {
      return;
    }
    socketContext.delete(socket.id);
    roomManager.leaveRoom(previous.roomId, previous.playerId);
    await socket.leave(previous.roomId);
  }

  async function attach(socket: Socket, roomId: string, playerUid: string | undefined, pseudo: string | undefined): Promise<void> {
    const current = socketContext.get(socket.id);
    if (current !== undefined && current.roomId !== roomId) {
      await detachFromCurrentRoom(socket);
    }

    const { playerId, replacedSocketId } = roomManager.joinRoom(roomId, socket.id, playerUid);
    if (replacedSocketId !== undefined) {
      // Le siège passe au nouveau socket : l'ancien ne peut plus agir en son nom.
      socketContext.delete(replacedSocketId);
      const replaced = io.sockets.sockets.get(replacedSocketId);
      if (replaced !== undefined) {
        await replaced.leave(roomId);
        replaced.emit(SERVER_EVENTS.ERROR, { code: "session_replaced", message: "this seat was opened in another tab" });
      }
    }

    await socket.join(roomId);
    socketContext.set(socket.id, { roomId, playerId });
    socket.emit(SERVER_EVENTS.ROOM_JOINED, { playerId, ...roomManager.getRoomPayload(roomId) });

    const effectivePseudo = pseudo ?? pendingPseudoBySocket.get(socket.id);
    if (effectivePseudo !== undefined) {
      roomManager.setPseudo(roomId, playerId, effectivePseudo);
    }

    const session = roomManager.getSession(roomId);
    if (session !== undefined && session.hasPlayer(playerId)) {
      await session.syncPlayer(playerId);
    }
  }

  io.on("connection", (socket: Socket) => {
    log.debug("socket connected", { socketId: socket.id });
    let windowStart = Date.now();
    let eventCount = 0;
    let warned = false;

    socket.use((_packet, next) => {
      const now = Date.now();
      if (now - windowStart > options.rateLimitWindowMs) {
        windowStart = now;
        eventCount = 0;
        warned = false;
      }
      eventCount += 1;
      if (eventCount > options.rateLimitMaxEvents) {
        if (!warned) {
          warned = true;
          socket.emit(SERVER_EVENTS.ERROR, { code: "rate_limited", message: "too many actions, slow down" });
        }
        return;
      }
      next();
    });

    on(socket, CLIENT_EVENTS.SET_PSEUDO, "invalid_pseudo", (payload) => {
      const pseudo = parsePseudo(payload.pseudo);
      pendingPseudoBySocket.set(socket.id, pseudo);
      const context = socketContext.get(socket.id);
      if (context !== undefined) {
        roomManager.setPseudo(context.roomId, context.playerId, pseudo);
      }
    });

    on(socket, CLIENT_EVENTS.CREATE_ROOM, "invalid_create_room", async (payload) => {
      const code = parseOptionalRoomCode(payload.code ?? payload.room_name);
      const playerUid = parseOptionalPlayerUid(payload.playerUid);
      const pseudo = parseOptionalPseudo(payload.pseudo);
      const roomId = roomManager.createRoom({ code, rulesetPreset: payload.ruleset_preset, ruleset: payload.ruleset });
      await attach(socket, roomId, playerUid, pseudo);
    });

    on(socket, CLIENT_EVENTS.JOIN_ROOM, "invalid_join_room", async (payload) => {
      const roomId = parseRoomCode(payload.code ?? payload.roomId);
      const playerUid = parseOptionalPlayerUid(payload.playerUid);
      const pseudo = parseOptionalPseudo(payload.pseudo);
      await attach(socket, roomId, playerUid, pseudo);
    });

    on(socket, CLIENT_EVENTS.START_GAME, "invalid_start_game", async (payload) => {
      const context = requireContext(socket);
      await roomManager.startGame(context.roomId, context.playerId, {
        rulesetPreset: payload.ruleset_preset,
        ruleset: payload.ruleset,
      });
    });

    on(socket, CLIENT_EVENTS.TABLE_ORDER_TAP, "invalid_table_order_tap", async () => {
      const context = requireContext(socket);
      await requireSession(context.roomId).handleTableOrderTap(context.playerId);
    });

    on(socket, CLIENT_EVENTS.TABLE_ORDER_ADJUST, "invalid_table_order_adjust", async (payload) => {
      const context = requireContext(socket);
      await requireSession(context.roomId).handleTableOrderAdjust(context.playerId, parsePosition(payload.position));
    });

    on(socket, CLIENT_EVENTS.TABLE_ORDER_CONFIRMED, "invalid_table_order_confirmation", async () => {
      const context = requireContext(socket);
      await requireSession(context.roomId).confirmTableOrder(context.playerId);
    });

    on(socket, CLIENT_EVENTS.TABLE_ORDER_BACK, "invalid_table_order_back", async () => {
      const context = requireContext(socket);
      await requireSession(context.roomId).resetTableOrder(context.playerId);
    });

    on(socket, CLIENT_EVENTS.ROLE_CONFIRMED, "invalid_role_confirmation", async () => {
      const context = requireContext(socket);
      await requireSession(context.roomId).confirmRoleReveal(context.playerId);
    });

    on(socket, CLIENT_EVENTS.PROPOSE_TEAM, "invalid_team_proposal", async (payload) => {
      const context = requireContext(socket);
      await requireSession(context.roomId).handleProposeTeam(context.playerId, parseTeam(payload.team));
    });

    on(socket, CLIENT_EVENTS.CONFIDENCE_VOTE, "invalid_confidence_vote", async (payload) => {
      const context = requireContext(socket);
      await requireSession(context.roomId).handleConfidenceVote(context.playerId, parseConfidenceVote(payload.vote));
    });

    on(socket, CLIENT_EVENTS.CONFIDENCE_RESULT_CONFIRMED, "invalid_confidence_result_confirmation", async () => {
      const context = requireContext(socket);
      await requireSession(context.roomId).confirmConfidenceResult(context.playerId);
    });

    on(socket, CLIENT_EVENTS.MISSION_VOTE, "invalid_mission_vote", async (payload) => {
      const context = requireContext(socket);
      await requireSession(context.roomId).handleMissionVote(context.playerId, parseMissionVote(payload.vote));
    });

    on(socket, CLIENT_EVENTS.MISSION_RESULT_CONFIRMED, "invalid_mission_result_confirmation", async () => {
      const context = requireContext(socket);
      await requireSession(context.roomId).confirmMissionResult(context.playerId);
    });

    on(socket, CLIENT_EVENTS.END_GAME_CONFIRMED, "invalid_end_game_confirmation", async () => {
      const context = requireContext(socket);
      await requireSession(context.roomId).confirmEndGame(context.playerId);
    });

    on(socket, CLIENT_EVENTS.REPLAY_CHOICE, "invalid_replay_choice", async (payload) => {
      const context = requireContext(socket);
      const choice = parseReplayChoice(payload.choice);
      if (choice === "quit") {
        await detachFromCurrentRoom(socket);
        return;
      }
      await roomManager.requestReplay(context.roomId, context.playerId);
    });

    on(socket, CLIENT_EVENTS.LEAVE_ROOM, "invalid_leave_room", async () => {
      requireContext(socket);
      await detachFromCurrentRoom(socket);
    });

    socket.on("disconnect", () => {
      log.debug("socket disconnected", { socketId: socket.id });
      const context = socketContext.get(socket.id);
      socketContext.delete(socket.id);
      pendingPseudoBySocket.delete(socket.id);
      if (context !== undefined) {
        roomManager.handleDisconnect(context.roomId, context.playerId, socket.id);
      }
    });
  });

  async function close(): Promise<void> {
    roomManager.disposeAll();
    await new Promise<void>((resolve) => {
      void io.close(() => resolve());
    });
  }

  return { httpServer, io, roomManager, close };
}
