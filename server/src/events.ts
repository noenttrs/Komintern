export const CLIENT_EVENTS = {
  SET_PSEUDO: "set_pseudo",
  JOIN_ROOM: "join_room",
  CREATE_ROOM: "create_room",
  START_GAME: "start_game",
  TABLE_ORDER_TAP: "table_order_tap",
  TABLE_ORDER_ADJUST: "table_order_adjust",
  TABLE_ORDER_CONFIRMED: "table_order_confirmed",
  TABLE_ORDER_BACK: "table_order_back",
  TABLE_ORDER_SET: "table_order_set",
  TABLE_ORDER_PAUSE: "table_order_pause",
  ROLE_CONFIRMED: "role_confirmed",
  PROPOSE_TEAM: "propose_team",
  CONFIDENCE_VOTE: "confidence_vote",
  CONFIDENCE_RESULT_CONFIRMED: "confidence_result_confirmed",
  MISSION_VOTE: "mission_vote",
  MISSION_RESULT_CONFIRMED: "mission_result_confirmed",
  END_GAME_CONFIRMED: "end_game_confirmed",
  REPLAY_CHOICE: "replay_choice",
  LEAVE_ROOM: "leave_room",
  CHAT_SEND: "chat_send",
  REPORT: "report",
  INVITE_FRIEND: "invite_friend",
  KICK_PLAYER: "kick_player",
  TRANSFER_HOST: "transfer_host",
  SET_ROOM_OPTIONS: "set_room_options",
  ABSENCE_VOTE: "absence_vote",
  SPECTATE: "spectate",
  SPECTATE_LINK: "spectate_link",
  VISIBILITY: "visibility",
  PUSH_SUBSCRIBE: "push_subscribe",
  DUEL_VOTE: "duel_vote",
} as const;

export const SERVER_EVENTS = {
  /** Envoyé au seul socket qui vient de rejoindre : porte son `playerId`. */
  ROOM_JOINED: "room_joined",
  /** État public de la room, diffusé à tous (jamais d'identifiant secret). */
  ROOM_UPDATED: "room_updated",
  PLAYER_LEFT: "player_left",
  GAME_STARTED: "game_started",
  GAME_ABORTED: "game_aborted",
  TABLE_ORDER_UPDATED: "table_order_updated",
  ROLE_ASSIGNED: "role_assigned",
  PROPOSAL_PHASE: "proposal_phase",
  CONFIDENCE_PHASE: "confidence_phase",
  CONFIDENCE_REVEALED: "confidence_revealed",
  MISSION_PHASE: "mission_phase",
  MISSION_PROGRESS: "mission_progress",
  MISSION_REVEALED: "mission_revealed",
  GAME_OVER: "game_over",
  ROLES_REVEALED: "roles_revealed",
  /** Duel à 2 : le vote est ouvert. */
  DUEL_PHASE: "duel_phase",
  /** Duel : qui a déjà voté (sans le vote). */
  DUEL_PROGRESS: "duel_progress",
  /** Duel : gagnants, raison, votes et rôles. */
  DUEL_RESULT: "duel_result",
  PLAYER_AFK: "player_afk",
  RESYNC: "resync",
  CHAT_MESSAGE: "chat_message",
  CHAT_HISTORY: "chat_history",
  REPORT_RECEIVED: "report_received",
  FRIEND_REQUEST: "friend_request",
  FRIENDS_CHANGED: "friends_changed",
  FRIEND_PRESENCE: "friend_presence",
  ROOM_INVITE: "room_invite",
  KICKED: "kicked",
  /** Avertissement de modération : le client recharge le compte pour l'afficher. */
  ACCOUNT_WARNING: "account_warning",
  SPECTATE_LINK_READY: "spectate_link_ready",
  SPECTATE_ENDED: "spectate_ended",
  ERROR: "error",
} as const;

/**
 * Vue publique (grand écran, stream) : seuls ces événements, diffusés à toute la room, sont relayés
 * aux spectateurs. Rôles (envoyés joueur par joueur) et chat n'y figurent jamais.
 */
export const PUBLIC_EVENTS: ReadonlySet<string> = new Set([
  SERVER_EVENTS.ROOM_UPDATED,
  SERVER_EVENTS.PLAYER_LEFT,
  SERVER_EVENTS.PLAYER_AFK,
  SERVER_EVENTS.GAME_STARTED,
  SERVER_EVENTS.GAME_ABORTED,
  SERVER_EVENTS.TABLE_ORDER_UPDATED,
  SERVER_EVENTS.PROPOSAL_PHASE,
  SERVER_EVENTS.CONFIDENCE_PHASE,
  SERVER_EVENTS.CONFIDENCE_REVEALED,
  SERVER_EVENTS.MISSION_PHASE,
  SERVER_EVENTS.MISSION_PROGRESS,
  SERVER_EVENTS.MISSION_REVEALED,
  SERVER_EVENTS.GAME_OVER,
  SERVER_EVENTS.ROLES_REVEALED,
  SERVER_EVENTS.DUEL_PHASE,
  SERVER_EVENTS.DUEL_PROGRESS,
  SERVER_EVENTS.DUEL_RESULT,
]);

/** Canal Socket.IO des spectateurs d'une room (distinct de celui des joueurs). */
export function publicChannel(code: string): string {
  return `${code}:public`;
}

/** Destinataires d'un événement de room : les joueurs, plus les spectateurs s'il est public. */
export function roomTargets(code: string, event: string): string | string[] {
  return PUBLIC_EVENTS.has(event) ? [code, publicChannel(code)] : code;
}
