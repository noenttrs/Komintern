import { createServer } from "http";
import type { Server as HttpServer } from "http";

import { createAdapter } from "@socket.io/redis-adapter";
import express from "express";
import { Server } from "socket.io";
import type { Socket } from "socket.io";

import { allow } from "./auth/rateLimit";
import { loadConfig } from "./config";
import type { Config } from "./config";
import { AdminService } from "./admin/service";
import { CLIENT_EVENTS, SERVER_EVENTS } from "./events";
import { DuelSession } from "./DuelSession";
import { GameSession } from "./GameSession";
import { clientIp, createApi, sessionIdFrom } from "./http/api";
import { log } from "./logger";
import { scanMessage } from "./moderation/filter";
import { ModerationPanel } from "./moderation/panel";
import { EngineError } from "./PythonBridge";
import { RoomManager } from "./RoomManager";
import type { AnySession, RoomManagerOptions } from "./RoomManager";
import { parsePushSubscription } from "./push/push";
import { createServices, createStores } from "./services";
import type { Services, Stores } from "./services";
import { RedisKv } from "./store/kv";
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
  config?: Config;
  /** Tests : stores en mémoire à la place de Mongo/Redis. */
  stores?: Stores;
};

export type KominternApp = {
  httpServer: HttpServer;
  io: Server;
  roomManager: RoomManager;
  services: Services;
  close: () => Promise<void>;
};

type SocketContext = { roomId: string; playerId: string };

type SocketUser = { userId: string; displayName: string | null; bannedUntil: Date | null; chatMutedUntil: Date | null };

const CHAT_MAX_LENGTH = 200;
const MAX_SOCKETS_PER_IP = 30;
/** Codes de room inexistants tentés par IP sur 10 minutes. */
const MAX_JOIN_MISSES = 20;
// eslint-disable-next-line no-control-regex
const CHAT_CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f]", "g");

function parseChatText(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("message must be a string");
  }
  const text = raw.replace(CHAT_CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
  if (text.length === 0 || [...text].length > CHAT_MAX_LENGTH) {
    throw new Error(`message must be 1-${CHAT_MAX_LENGTH} characters`);
  }
  return text;
}

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
  const config = options.config ?? loadConfig();
  const expressApp = express();
  expressApp.disable("x-powered-by");
  expressApp.set("trust proxy", false);
  const httpServer = createServer(expressApp);
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

  const storesSetup = options.stores === undefined ? createStores(config) : { stores: options.stores, ready: Promise.resolve(), close: async () => undefined };
  const notify = (userId: string, event: string, payload: unknown): void => {
    io.to(`user:${userId}`).emit(event, payload);
  };
  const services = createServices(config, storesSetup.stores, notify, storesSetup.close);

  if (config.socketRedisAdapter && services.kv instanceof RedisKv) {
    // Diffusions partagées entre instances ; inutile tant qu'il n'y en a qu'une.
    const pub = services.kv.raw.duplicate();
    const sub = services.kv.raw.duplicate();
    pub.on("error", (error: Error) => log.warn("redis adapter error", { message: error.message }));
    sub.on("error", (error: Error) => log.warn("redis adapter error", { message: error.message }));
    io.adapter(createAdapter(pub, sub));
  }

  const roomManager = new RoomManager(io, {
    ...options,
    hooks: {
      onGameRecorded: (game) => services.recordGame(game),
      onUsersInGame: (userIds, inGame) => services.presence.setInGame(userIds, inGame),
      onNotify: (code, playerId, notification) => {
        const subscription = roomManager.getPushSubscription(code, playerId);
        if (subscription === undefined) return;
        void services.push.send(subscription, code, notification).then((alive) => {
          if (!alive && roomManager.hasRoom(code)) roomManager.setPushSubscription(code, playerId, null);
        });
      },
    },
  });
  const admin = new AdminService(services.users, services.gameLogs, services.contact, services.kv, () => roomManager.liveStats(), async (userId) => {
    await services.sessions.destroyAll(userId);
    io.in(`user:${userId}`).disconnectSockets(true);
  }, (userId) => refreshAccount(userId));

  /** Sanction ou avertissement : connexions du compte mises à jour (chat) et joueur prévenu. */
  function refreshAccount(userId: string): void {
    void services.users.findById(userId).then((user) => {
      if (user === null) return;
      for (const [socketId, entry] of userBySocket) {
        if (entry.userId === userId) userBySocket.set(socketId, { ...entry, bannedUntil: user.bannedUntil, chatMutedUntil: user.chatMutedUntil });
      }
      notify(userId, SERVER_EVENTS.ACCOUNT_WARNING, {});
    });
  }
  const moderationPanel = new ModerationPanel(services.users, services.gameLogs, (userId) => refreshAccount(userId));
  expressApp.use("/api", createApi(services, admin, () => roomManager.listPublicRooms(), moderationPanel));
  const userBySocket = new Map<string, SocketUser>();

  // La session (cookie httpOnly) est lue au handshake : un socket est invité ou connecté.
  io.use((socket, next) => {
    services.sessions
      .resolve(sessionIdFrom(socket.request))
      .then(async (userId) => {
        if (userId !== null) {
          const user = await services.users.findById(userId);
          if (user !== null) {
            userBySocket.set(socket.id, { userId: user.id, displayName: user.displayName, bannedUntil: user.bannedUntil, chatMutedUntil: user.chatMutedUntil });
          }
        }
      })
      .catch((error: unknown) => log.warn("session lookup failed on handshake", { message: error instanceof Error ? error.message : String(error) }))
      .finally(() => next());
  });
  const socketContext = new Map<string, SocketContext>();
  const pendingPseudoBySocket = new Map<string, string>();

  function requireContext(socket: Socket): SocketContext {
    const context = socketContext.get(socket.id);
    if (context === undefined) {
      throw new Error("not joined to a room");
    }
    return context;
  }

  function requireSession(roomId: string): AnySession {
    const session = roomManager.getSession(roomId);
    if (session === undefined) {
      throw new Error("no game is running in this room");
    }
    return session;
  }

  /** Actions propres aux parties à missions (pas au duel). */
  function requireMissions(roomId: string): GameSession {
    const session = requireSession(roomId);
    if (!(session instanceof GameSession)) {
      throw new Error("action not allowed now");
    }
    return session;
  }

  function requireDuel(roomId: string): DuelSession {
    const session = requireSession(roomId);
    if (!(session instanceof DuelSession)) {
      throw new Error("action not allowed now");
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

    const user = userBySocket.get(socket.id);
    const { playerId, replacedSocketId } = roomManager.joinRoom(roomId, socket.id, playerUid, user?.userId);
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

    // Connecté : le pseudo du compte fait foi.
    const effectivePseudo = user?.displayName ?? pseudo ?? pendingPseudoBySocket.get(socket.id);
    if (effectivePseudo !== undefined) {
      roomManager.setPseudo(roomId, playerId, effectivePseudo);
    }
    socket.emit(SERVER_EVENTS.CHAT_HISTORY, { messages: roomManager.getChat(roomId) });

    const session = roomManager.getSession(roomId);
    if (session !== undefined && session.hasPlayer(playerId)) {
      await session.syncPlayer(playerId);
    }
  }

  // Connexions simultanées par IP : un seul client ne peut pas épuiser les rooms du serveur.
  const socketsByIp = new Map<string, number>();

  io.on("connection", (socket: Socket) => {
    log.debug("socket connected", { socketId: socket.id });
    const ip = clientIp(socket.request);
    const openFromIp = (socketsByIp.get(ip) ?? 0) + 1;
    socketsByIp.set(ip, openFromIp);
    socket.on("disconnect", () => {
      const left = (socketsByIp.get(ip) ?? 1) - 1;
      if (left <= 0) socketsByIp.delete(ip);
      else socketsByIp.set(ip, left);
    });
    if (openFromIp > MAX_SOCKETS_PER_IP) {
      socket.emit(SERVER_EVENTS.ERROR, { code: "rate_limited", message: "too many connections from this network" });
      socket.disconnect(true);
      return;
    }
    const connectedUser = userBySocket.get(socket.id);
    if (connectedUser !== undefined) {
      void socket.join(`user:${connectedUser.userId}`);
      services.presence.connect(connectedUser.userId, socket.id);
    }
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

    let chatWindowStart = 0;
    let chatCount = 0;
    on(socket, CLIENT_EVENTS.CHAT_SEND, "invalid_chat", async (payload) => {
      const context = requireContext(socket);
      const user = userBySocket.get(socket.id);
      if (user?.bannedUntil != null && user.bannedUntil > new Date()) {
        throw new Error("you are banned from the chat");
      }
      if (user?.chatMutedUntil != null && user.chatMutedUntil > new Date()) {
        throw new Error("your chat is muted for now");
      }
      const text = parseChatText(payload.text);
      const now = Date.now();
      if (now - chatWindowStart > 10_000) {
        chatWindowStart = now;
        chatCount = 0;
      }
      chatCount += 1;
      if (chatCount > 5) {
        throw new Error("too many messages, slow down");
      }
      // Pas de censure : le message s'affiche tel quel ; un terme signalé ouvre seulement un
      // dossier que les modérateurs vérifient à la main.
      const flagged = scanMessage(text, services.wordList);
      roomManager.addChatMessage(context.roomId, context.playerId, text, text, flagged.length > 0);
      // Un dossier par joueur et par room toutes les 10 minutes au plus (les suivants s'y ajoutent via le log).
      if (flagged.length > 0 && (await allow(services.kv, "flag-case", `${context.roomId}:${context.playerId}`, 1, 600))) {
        const author = roomManager.getIdentity(context.roomId, context.playerId);
        const trigger = { type: "flagged_word" as const, words: flagged.map((entry) => entry.term), categories: [...new Set(flagged.map((entry) => entry.category))] };
        void openModerationCase(context.roomId, trigger, author === null ? [] : [author]);
      }
    });

    on(socket, CLIENT_EVENTS.REPORT, "invalid_report", async (payload) => {
      const context = requireContext(socket);
      if (!(await allow(services.kv, "report", `${context.roomId}:${context.playerId}`, 3, 600))) {
        throw new Error("too many reports, slow down");
      }
      const reason = typeof payload.reason === "string" ? payload.reason.slice(0, 200) : "";
      const messageId = typeof payload.messageId === "string" ? payload.messageId : undefined;
      const reportedId =
        typeof payload.playerId === "string"
          ? payload.playerId
          : roomManager.getChatForModeration(context.roomId).find((message) => message.id === messageId)?.playerId;
      const reporter = roomManager.getIdentity(context.roomId, context.playerId);
      const reported = reportedId === undefined ? null : roomManager.getIdentity(context.roomId, reportedId);
      if (reporter === null || reported === null) {
        throw new Error("unknown player to report");
      }
      await openModerationCase(context.roomId, { type: "report", reporter, reason }, [reporter, reported]);
      socket.emit(SERVER_EVENTS.REPORT_RECEIVED, {});
    });

    on(socket, CLIENT_EVENTS.INVITE_FRIEND, "invalid_invite", async (payload) => {
      const context = requireContext(socket);
      const user = userBySocket.get(socket.id);
      if (user === undefined) {
        throw new Error("log in to invite friends");
      }
      const friendId = typeof payload.userId === "string" ? payload.userId : "";
      if (!(await services.friendService.areFriends(user.userId, friendId))) {
        throw new Error("you can only invite your friends");
      }
      if (roomManager.getStatus(context.roomId) !== "waiting") {
        throw new Error("invitations are only possible from the lobby");
      }
      if (!services.presence.isOnline(friendId)) {
        throw new Error("this friend is offline");
      }
      if (!(await allow(services.kv, "invite", user.userId, 10, 60))) {
        throw new Error("too many invitations, slow down");
      }
      notify(friendId, SERVER_EVENTS.ROOM_INVITE, { from: { userId: user.userId, displayName: user.displayName }, code: context.roomId });
    });

    on(socket, CLIENT_EVENTS.HOLD_PLAYER, "invalid_hold", (payload) => {
      const context = requireContext(socket);
      roomManager.holdForPlayer(context.roomId, context.playerId, typeof payload.playerId === "string" ? payload.playerId : "");
    });

    on(socket, CLIENT_EVENTS.RELEASE_HOLD, "invalid_hold", (payload) => {
      const context = requireContext(socket);
      roomManager.releaseHold(context.roomId, context.playerId, typeof payload.playerId === "string" ? payload.playerId : "");
    });

    on(socket, CLIENT_EVENTS.VISIBILITY, "invalid_visibility", (payload) => {
      const context = socketContext.get(socket.id);
      if (context !== undefined) roomManager.setVisibility(context.roomId, context.playerId, payload.visible !== false);
    });

    on(socket, CLIENT_EVENTS.PUSH_SUBSCRIBE, "invalid_push_subscription", (payload) => {
      const context = requireContext(socket);
      if (!services.push.enabled) throw new Error("notifications are not available");
      const subscription = payload.subscription === null ? null : parsePushSubscription(payload.subscription);
      roomManager.setPushSubscription(context.roomId, context.playerId, subscription);
    });

    on(socket, CLIENT_EVENTS.KICK_PLAYER, "invalid_kick", async (payload) => {
      const context = requireContext(socket);
      const targetId = typeof payload.playerId === "string" ? payload.playerId : "";
      const kickedSocketId = roomManager.kickPlayer(context.roomId, context.playerId, targetId);
      if (kickedSocketId !== undefined) {
        socketContext.delete(kickedSocketId);
        const kicked = io.sockets.sockets.get(kickedSocketId);
        if (kicked !== undefined) {
          await kicked.leave(context.roomId);
          kicked.emit(SERVER_EVENTS.KICKED, { code: context.roomId });
        }
      }
    });

    on(socket, CLIENT_EVENTS.TRANSFER_HOST, "invalid_transfer_host", (payload) => {
      const context = requireContext(socket);
      roomManager.transferHost(context.roomId, context.playerId, typeof payload.playerId === "string" ? payload.playerId : "");
    });

    on(socket, CLIENT_EVENTS.SET_ROOM_OPTIONS, "invalid_room_options", (payload) => {
      const context = requireContext(socket);
      if (typeof payload.isPublic === "boolean") {
        roomManager.setPublic(context.roomId, context.playerId, payload.isPublic);
      }
      if (typeof payload.chatEnabled === "boolean") {
        roomManager.setChatEnabled(context.roomId, context.playerId, payload.chatEnabled);
      }
      if (payload.pace === "classic" || payload.pace === "quick") {
        roomManager.setPace(context.roomId, context.playerId, payload.pace);
      }
    });

    on(socket, CLIENT_EVENTS.SET_PSEUDO, "invalid_pseudo", (payload) => {
      const pseudo = parsePseudo(payload.pseudo);
      // Connecté : le pseudo du compte fait foi, il ne se change pas depuis la room.
      if (userBySocket.get(socket.id)?.displayName != null) return;
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
      if (payload.isPublic === true && userBySocket.get(socket.id) === undefined) {
        throw new Error("log in to create a public room");
      }
      if (!(await allow(services.kv, "create-room", ip, 60, 3600))) {
        throw new Error("too many rooms created, try again later");
      }
      const roomId = roomManager.createRoom({
        isPublic: payload.isPublic === true,
        code,
        rulesetPreset: payload.ruleset_preset,
        ruleset: payload.ruleset,
        // Chat activé par défaut ; `chatEnabled: false` pour une partie jouée sur place.
        chatEnabled: payload.chatEnabled !== false,
        pace: payload.pace,
      });
      await attach(socket, roomId, playerUid, pseudo);
    });

    on(socket, CLIENT_EVENTS.JOIN_ROOM, "invalid_join_room", async (payload) => {
      const roomId = parseRoomCode(payload.code ?? payload.roomId);
      const playerUid = parseOptionalPlayerUid(payload.playerUid);
      const pseudo = parseOptionalPseudo(payload.pseudo);
      // Codes inexistants limités par IP : on ne peut pas balayer les codes pour trouver des rooms privées.
      if (Number((await services.kv.get(`rl:join-miss:${ip}`)) ?? 0) >= MAX_JOIN_MISSES) {
        throw new Error("too many attempts, try again later");
      }
      try {
        await attach(socket, roomId, playerUid, pseudo);
      } catch (error) {
        if (error instanceof Error && error.message === "room not found") {
          await allow(services.kv, "join-miss", ip, MAX_JOIN_MISSES, 600);
        }
        throw error;
      }
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
      await requireMissions(context.roomId).handleTableOrderTap(context.playerId);
    });

    on(socket, CLIENT_EVENTS.TABLE_ORDER_ADJUST, "invalid_table_order_adjust", async (payload) => {
      const context = requireContext(socket);
      await requireMissions(context.roomId).handleTableOrderAdjust(context.playerId, parsePosition(payload.position));
    });

    on(socket, CLIENT_EVENTS.TABLE_ORDER_CONFIRMED, "invalid_table_order_confirmation", async () => {
      const context = requireContext(socket);
      await requireMissions(context.roomId).confirmTableOrder(context.playerId);
    });

    on(socket, CLIENT_EVENTS.TABLE_ORDER_BACK, "invalid_table_order_back", async () => {
      const context = requireContext(socket);
      await requireMissions(context.roomId).resetTableOrder(context.playerId);
    });

    on(socket, CLIENT_EVENTS.ROLE_CONFIRMED, "invalid_role_confirmation", async () => {
      const context = requireContext(socket);
      await requireSession(context.roomId).confirmRoleReveal(context.playerId);
    });

    on(socket, CLIENT_EVENTS.PROPOSE_TEAM, "invalid_team_proposal", async (payload) => {
      const context = requireContext(socket);
      await requireMissions(context.roomId).handleProposeTeam(context.playerId, parseTeam(payload.team));
    });

    on(socket, CLIENT_EVENTS.CONFIDENCE_VOTE, "invalid_confidence_vote", async (payload) => {
      const context = requireContext(socket);
      await requireMissions(context.roomId).handleConfidenceVote(context.playerId, parseConfidenceVote(payload.vote));
    });

    on(socket, CLIENT_EVENTS.CONFIDENCE_RESULT_CONFIRMED, "invalid_confidence_result_confirmation", async () => {
      const context = requireContext(socket);
      await requireMissions(context.roomId).confirmConfidenceResult(context.playerId);
    });

    on(socket, CLIENT_EVENTS.MISSION_VOTE, "invalid_mission_vote", async (payload) => {
      const context = requireContext(socket);
      await requireMissions(context.roomId).handleMissionVote(context.playerId, parseMissionVote(payload.vote));
    });

    on(socket, CLIENT_EVENTS.MISSION_RESULT_CONFIRMED, "invalid_mission_result_confirmation", async () => {
      const context = requireContext(socket);
      await requireMissions(context.roomId).confirmMissionResult(context.playerId);
    });

    on(socket, CLIENT_EVENTS.DUEL_VOTE, "invalid_duel_vote", async (payload) => {
      const context = requireContext(socket);
      if (payload.vote !== "trust" && payload.vote !== "accuse") throw new Error("vote must be trust or accuse");
      await requireDuel(context.roomId).handleDuelVote(context.playerId, payload.vote);
    });

    on(socket, CLIENT_EVENTS.END_GAME_CONFIRMED, "invalid_end_game_confirmation", async () => {
      const context = requireContext(socket);
      await requireMissions(context.roomId).confirmEndGame(context.playerId);
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
      const user = userBySocket.get(socket.id);
      userBySocket.delete(socket.id);
      if (user !== undefined) {
        services.presence.disconnect(user.userId, socket.id);
      }
      const context = socketContext.get(socket.id);
      socketContext.delete(socket.id);
      pendingPseudoBySocket.delete(socket.id);
      if (context !== undefined) {
        roomManager.handleDisconnect(context.roomId, context.playerId, socket.id);
      }
    });
  });

  async function openModerationCase(
    roomId: string,
    trigger: { type: "flagged_word"; words: string[]; categories?: string[] } | { type: "report"; reporter: { playerId: string; userId: string | null; pseudo: string }; reason: string },
    involved: Array<{ playerId: string; userId: string | null; pseudo: string }>,
  ): Promise<void> {
    try {
      const messages = roomManager.getChatForModeration(roomId).map((message) => ({
        playerId: message.playerId,
        userId: roomManager.getIdentity(roomId, message.playerId)?.userId ?? null,
        pseudo: message.pseudo,
        text: message.original,
        at: message.at,
        flagged: message.flagged,
      }));
      const caseId = await services.moderation.openCase({ trigger, roomCode: roomId, gameId: roomManager.getCurrentGameId(roomId), messages, involved });
      log.info("moderation case opened", { caseId, trigger: trigger.type });
    } catch (error) {
      log.error("failed to open moderation case", { error });
    }
  }

  async function close(): Promise<void> {
    roomManager.disposeAll();
    await services.close();
    await new Promise<void>((resolve) => {
      void io.close(() => resolve());
    });
  }

  return { httpServer, io, roomManager, services, close };
}
