import { useEffect, useMemo, useReducer, useRef } from "react";

import { CLIENT_EVENTS, SERVER_EVENTS } from "../events";
import { gameReducer, initialGameState } from "../gameState";
import type { GameState } from "../gameState";
import { ROOM_CODE_PATTERN, normalizeRoomCode, stringValue, toRecord } from "../protocol";
import { socket } from "../socket";
import type { ConfidenceVote, Faction, MissionVote, StartGameVariantConfig, UIPhase } from "../types";

const PSEUDO_STORAGE_KEY = "komintern.pseudo";
// Par onglet (sessionStorage) : un onglet = un joueur, et un rechargement garde sa place.
const ROOM_STORAGE_KEY = "komintern.room_code";
const PLAYER_UID_KEY = "komintern.player_uid";
const PSEUDO_MAX_LENGTH = 20;

type Storage = "local" | "session";

function readStorage(kind: Storage, key: string): string {
  try {
    return (kind === "local" ? window.localStorage : window.sessionStorage).getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(kind: Storage, key: string, value: string | null): void {
  try {
    const storage = kind === "local" ? window.localStorage : window.sessionStorage;
    if (value === null || value === "") {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  } catch {
    // Stockage indisponible (navigation privée) : on continue sans persistance.
  }
}

function generateUid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getOrCreatePlayerUid(): string {
  const existing = readStorage("session", PLAYER_UID_KEY);
  if (/^[A-Za-z0-9_-]{16,128}$/.test(existing)) {
    return existing;
  }
  const generated = generateUid();
  writeStorage("session", PLAYER_UID_KEY, generated);
  return generated;
}

/** Événements qui modifient l'état de la partie : jamais émis avant que le siège soit repris. */
type GameActionEvent = Exclude<(typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS], "create_room" | "join_room">;

export interface GameActions {
  setPseudo: (value: string) => void;
  confirmPseudo: () => void;
  navigate: (phase: UIPhase) => void;
  dismissError: () => void;
  createRoom: (options?: { roomName?: string; config?: StartGameVariantConfig | null; chatEnabled?: boolean }) => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  startGame: () => void;
  tableOrderTap: () => void;
  adjustTableOrder: (position: number) => void;
  confirmTableOrder: () => void;
  resetTableOrder: () => void;
  confirmRole: () => void;
  proposeTeam: (team: string[]) => void;
  sendConfidenceVote: (vote: ConfidenceVote) => void;
  confirmConfidenceResult: () => void;
  sendMissionVote: (vote: MissionVote) => void;
  confirmMissionResult: () => void;
  confirmEndGame: () => void;
  sendReplayChoice: (choice: "replay" | "quit") => void;
  sendChat: (text: string) => void;
  report: (target: { playerId?: string; messageId?: string }, reason: string) => void;
  inviteFriend: (userId: string) => void;
  acceptInvite: () => void;
  dismissInvite: () => void;
  dismissNotice: () => void;
  kickPlayer: (playerId: string) => void;
  transferHost: (playerId: string) => void;
  setChatMode: (enabled: boolean) => void;
}

export type UseGameSocketResult = GameState & GameActions & { winner: Faction | null };

export function useGameSocket(): UseGameSocketResult {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    initialGameState(readStorage("local", PSEUDO_STORAGE_KEY).slice(0, PSEUDO_MAX_LENGTH), readStorage("session", ROOM_STORAGE_KEY)),
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const uidRef = useRef(getOrCreatePlayerUid());
  // Siège repris sur le socket courant (room_joined reçu depuis la dernière connexion).
  const joinedRef = useRef(false);
  // Un create/join explicite est en cours : pas de rejoin automatique concurrent.
  const pendingJoinRef = useRef(false);
  const queueRef = useRef<Array<{ event: string; payload: Record<string, unknown> }>>([]);
  // Demande de création/entrée en attente : envoyée à la connexion (et renvoyée après une
  // reconnexion) plutôt que confiée au tampon de Socket.IO, qui peut la perdre.
  const joinRequestRef = useRef<{ event: string; payload: Record<string, unknown> } | null>(null);

  useEffect(() => {
    const sendPendingJoin = (): boolean => {
      const request = joinRequestRef.current;
      if (request === null) {
        return false;
      }
      socket.emit(request.event, request.payload);
      return true;
    };

    const rejoinStoredRoom = (): void => {
      const code = readStorage("session", ROOM_STORAGE_KEY);
      const pseudo = stateRef.current.pseudo.trim();
      if (code === "" || pseudo === "" || pendingJoinRef.current) {
        return;
      }
      socket.emit(CLIENT_EVENTS.JOIN_ROOM, { code, pseudo, playerUid: uidRef.current });
    };

    const forgetRoom = (): void => {
      joinedRef.current = false;
      pendingJoinRef.current = false;
      joinRequestRef.current = null;
      queueRef.current = [];
      writeStorage("session", ROOM_STORAGE_KEY, null);
      dispatch({ type: "left_room" });
    };

    const onConnect = (): void => {
      dispatch({ type: "connection", status: "connected" });
      if (!sendPendingJoin()) {
        rejoinStoredRoom();
      }
    };
    const onDisconnect = (): void => {
      joinedRef.current = false;
      dispatch({ type: "connection", status: "disconnected" });
    };
    const onConnectError = (): void => {
      dispatch({ type: "connection", status: "disconnected" });
    };
    const onRoomJoined = (payload: unknown): void => {
      joinedRef.current = true;
      pendingJoinRef.current = false;
      joinRequestRef.current = null;
      const code = stringValue(toRecord(payload).code);
      if (code !== null) {
        writeStorage("session", ROOM_STORAGE_KEY, code);
      }
      dispatch({ type: "server", event: SERVER_EVENTS.ROOM_JOINED, payload });
      const queued = queueRef.current;
      queueRef.current = [];
      for (const { event, payload: actionPayload } of queued) {
        socket.emit(event, actionPayload);
      }
    };
    const onError = (payload: unknown): void => {
      const code = stringValue(toRecord(payload).code);
      if (code === "invalid_join_room" || code === "invalid_create_room") {
        joinRequestRef.current = null;
        if (!joinedRef.current) {
          forgetRoom();
        }
      } else if (code === "session_replaced") {
        // Un autre onglet a repris ce siège : cet onglet redevient un nouveau joueur.
        uidRef.current = generateUid();
        writeStorage("session", PLAYER_UID_KEY, uidRef.current);
        forgetRoom();
      }
      dispatch({ type: "server", event: SERVER_EVENTS.ERROR, payload });
    };

    const forwarded = Object.values(SERVER_EVENTS).filter(
      (event) => event !== SERVER_EVENTS.ROOM_JOINED && event !== SERVER_EVENTS.ERROR,
    );
    const forwarders = forwarded.map((event) => {
      const handler = (payload: unknown): void => dispatch({ type: "server", event, payload });
      socket.on(event, handler);
      return [event, handler] as const;
    });

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on(SERVER_EVENTS.ROOM_JOINED, onRoomJoined);
    socket.on(SERVER_EVENTS.ERROR, onError);
    const onKicked = (): void => {
      forgetRoom();
      dispatch({ type: "notice", message: "L'hôte t'a retiré de la room." });
    };
    socket.on(SERVER_EVENTS.KICKED, onKicked);

    // Rechargement en pleine partie : on se reconnecte et on reprend sa place.
    if (readStorage("session", ROOM_STORAGE_KEY) !== "" && stateRef.current.pseudo.trim() !== "") {
      dispatch({ type: "connection", status: "connecting" });
      if (socket.connected) {
        rejoinStoredRoom();
      } else {
        socket.connect();
      }
    }

    return () => {
      for (const [event, handler] of forwarders) {
        socket.off(event, handler);
      }
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off(SERVER_EVENTS.ROOM_JOINED, onRoomJoined);
      socket.off(SERVER_EVENTS.ERROR, onError);
      socket.off(SERVER_EVENTS.KICKED, onKicked);
    };
  }, []);

  const actions = useMemo<GameActions>(() => {
    const ensureConnected = (): void => {
      if (!socket.connected) {
        dispatch({ type: "connection", status: "connecting" });
        socket.connect();
      }
    };

    /** Action de jeu : envoyée seulement une fois le siège repris, sinon mise en file. */
    const emitAction = (event: GameActionEvent, payload: Record<string, unknown> = {}): void => {
      if (socket.connected && joinedRef.current) {
        socket.emit(event, payload);
        return;
      }
      queueRef.current.push({ event, payload });
      ensureConnected();
    };

    const emitJoin = (event: "create_room" | "join_room", payload: Record<string, unknown>): void => {
      pendingJoinRef.current = true;
      joinRequestRef.current = { event, payload: { ...payload, pseudo: stateRef.current.pseudo.trim(), playerUid: uidRef.current } };
      if (socket.connected) {
        socket.emit(joinRequestRef.current.event, joinRequestRef.current.payload);
      } else {
        ensureConnected(); // envoyée par onConnect
      }
    };

    const leaveLocally = (): void => {
      joinedRef.current = false;
      pendingJoinRef.current = false;
      joinRequestRef.current = null;
      queueRef.current = [];
      writeStorage("session", ROOM_STORAGE_KEY, null);
      dispatch({ type: "left_room" });
    };

    return {
      setPseudo: (value) => {
        const trimmed = value.slice(0, PSEUDO_MAX_LENGTH);
        dispatch({ type: "set_pseudo", pseudo: trimmed });
        writeStorage("local", PSEUDO_STORAGE_KEY, trimmed.trim());
      },
      confirmPseudo: () => {
        const trimmed = stateRef.current.pseudo.trim();
        if (trimmed === "") {
          dispatch({ type: "error", message: "Pseudo requis" });
          return;
        }
        dispatch({ type: "set_pseudo", pseudo: trimmed });
        writeStorage("local", PSEUDO_STORAGE_KEY, trimmed);
        dispatch({ type: "navigate", phase: "landing" });
      },
      navigate: (phase) => dispatch({ type: "navigate", phase }),
      dismissError: () => dispatch({ type: "clear_error" }),
      dismissNotice: () => dispatch({ type: "clear_notice" }),
      dismissInvite: () => dispatch({ type: "dismiss_invite" }),
      acceptInvite: () => {
        const invite = stateRef.current.invite;
        dispatch({ type: "dismiss_invite" });
        if (invite !== null && stateRef.current.pseudo.trim() !== "") {
          emitJoin(CLIENT_EVENTS.JOIN_ROOM, { code: invite.code });
        }
      },
      sendChat: (text) => {
        const trimmed = text.trim();
        if (trimmed !== "") {
          emitAction(CLIENT_EVENTS.CHAT_SEND, { text: trimmed.slice(0, 200) });
        }
      },
      kickPlayer: (playerId) => emitAction(CLIENT_EVENTS.KICK_PLAYER, { playerId }),
      transferHost: (playerId) => emitAction(CLIENT_EVENTS.TRANSFER_HOST, { playerId }),
      setChatMode: (enabled) => emitAction(CLIENT_EVENTS.SET_ROOM_OPTIONS, { chatEnabled: enabled }),
      report: (target, reason) => emitAction(CLIENT_EVENTS.REPORT, { ...target, reason: reason.slice(0, 200) }),
      inviteFriend: (userId) => {
        emitAction(CLIENT_EVENTS.INVITE_FRIEND, { userId });
        dispatch({ type: "notice", message: "Invitation envoyée." });
      },
      createRoom: (options) => {
        if (stateRef.current.pseudo.trim() === "") {
          dispatch({ type: "error", message: "Pseudo requis" });
          return;
        }
        const code = normalizeRoomCode(options?.roomName ?? "");
        if (code !== "" && !ROOM_CODE_PATTERN.test(code)) {
          dispatch({ type: "error", message: "Code de room invalide : 3 à 24 caractères parmi A-Z, 0-9, _ et -." });
          return;
        }
        const config = options?.config;
        emitJoin(CLIENT_EVENTS.CREATE_ROOM, {
          ...(code !== "" ? { code } : {}),
          ...(config?.ruleset_preset ? { ruleset_preset: config.ruleset_preset } : {}),
          ...(config?.ruleset ? { ruleset: config.ruleset } : {}),
          chatEnabled: options?.chatEnabled !== false,
        });
      },
      joinRoom: (rawCode) => {
        const code = normalizeRoomCode(rawCode);
        if (stateRef.current.pseudo.trim() === "" || !ROOM_CODE_PATTERN.test(code)) {
          dispatch({ type: "error", message: "Pseudo et code de room valide requis" });
          return;
        }
        emitJoin(CLIENT_EVENTS.JOIN_ROOM, { code });
      },
      leaveRoom: () => {
        if (socket.connected && joinedRef.current) {
          socket.emit(CLIENT_EVENTS.LEAVE_ROOM, {});
        }
        leaveLocally();
      },
      startGame: () => emitAction(CLIENT_EVENTS.START_GAME),
      tableOrderTap: () => emitAction(CLIENT_EVENTS.TABLE_ORDER_TAP),
      adjustTableOrder: (position) => emitAction(CLIENT_EVENTS.TABLE_ORDER_ADJUST, { position }),
      confirmTableOrder: () => emitAction(CLIENT_EVENTS.TABLE_ORDER_CONFIRMED),
      resetTableOrder: () => emitAction(CLIENT_EVENTS.TABLE_ORDER_BACK),
      confirmRole: () => emitAction(CLIENT_EVENTS.ROLE_CONFIRMED),
      proposeTeam: (team) => emitAction(CLIENT_EVENTS.PROPOSE_TEAM, { team }),
      sendConfidenceVote: (vote) => emitAction(CLIENT_EVENTS.CONFIDENCE_VOTE, { vote }),
      confirmConfidenceResult: () => emitAction(CLIENT_EVENTS.CONFIDENCE_RESULT_CONFIRMED),
      sendMissionVote: (vote) => emitAction(CLIENT_EVENTS.MISSION_VOTE, { vote }),
      confirmMissionResult: () => emitAction(CLIENT_EVENTS.MISSION_RESULT_CONFIRMED),
      confirmEndGame: () => emitAction(CLIENT_EVENTS.END_GAME_CONFIRMED),
      sendReplayChoice: (choice) => {
        if (choice === "quit") {
          if (socket.connected && joinedRef.current) {
            socket.emit(CLIENT_EVENTS.REPLAY_CHOICE, { choice });
          }
          leaveLocally();
          return;
        }
        emitAction(CLIENT_EVENTS.REPLAY_CHOICE, { choice });
      },
    };
  }, []);

  return { ...state, ...actions, winner: state.gameOver?.winner ?? null };
}
