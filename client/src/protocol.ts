// Parsing défensif des payloads serveur : tout ce qui arrive du socket est `unknown`.
import type {
  ChatMessage,
  ConfidenceHistoryEntry,
  ConfidenceVote,
  Faction,
  GameOverState,
  MissionHistoryEntry,
  RoomPlayer,
  RoomStatus,
  ScoreState,
  UIPhase,
} from "./types";

export type Dictionary = Record<string, unknown>;

export function toRecord(value: unknown): Dictionary {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Dictionary) : {};
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function boolValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function faction(value: unknown): Faction | null {
  return value === "nazi" || value === "communist" ? value : null;
}

export function factionMap(value: unknown): Record<string, Faction> {
  const result: Record<string, Faction> = {};
  for (const [id, raw] of Object.entries(toRecord(value))) {
    const parsed = faction(raw);
    if (parsed !== null) {
      result[id] = parsed;
    }
  }
  return result;
}

export function parseScores(value: unknown): ScoreState | null {
  const record = toRecord(value);
  const nazi = numberValue(record.nazi);
  const communist = numberValue(record.communist);
  return nazi === null || communist === null ? null : { nazi, communist };
}

export type RoomSnapshot = {
  code: string | null;
  players: RoomPlayer[];
  hostId: string | null;
  targetPlayerCount: number | null;
  status: RoomStatus | null;
};

const ROOM_STATUSES: RoomStatus[] = ["waiting", "table_order", "playing", "finished"];

export function parseRoom(value: unknown): RoomSnapshot {
  const payload = toRecord(value);
  const players: RoomPlayer[] = [];
  if (Array.isArray(payload.players)) {
    for (const entry of payload.players) {
      const row = toRecord(entry);
      const id = stringValue(row.playerId);
      if (id === null) {
        continue;
      }
      players.push({
        id,
        pseudo: stringValue(row.pseudo) ?? undefined,
        isHost: boolValue(row.isHost) ?? undefined,
        isAfk: boolValue(row.isAfk) ?? undefined,
        isConnected: boolValue(row.isConnected) ?? undefined,
      });
    }
  }
  const status = stringValue(payload.status);
  return {
    code: stringValue(payload.code),
    players,
    hostId: stringValue(payload.hostPlayerId) ?? players.find((player) => player.isHost)?.id ?? null,
    targetPlayerCount: numberValue(payload.targetPlayerCount),
    status: status !== null && (ROOM_STATUSES as string[]).includes(status) ? (status as RoomStatus) : null,
  };
}

export function parseConfidenceVotes(value: unknown): Record<string, ConfidenceVote> {
  const votes: Record<string, ConfidenceVote> = {};
  if (Array.isArray(value)) {
    for (const entry of value) {
      const row = toRecord(entry);
      const id = stringValue(row.playerId);
      if (id !== null && (row.vote === "yes" || row.vote === "no")) {
        votes[id] = row.vote;
      }
    }
  }
  return votes;
}

export function parseMissionHistoryEntry(value: unknown): MissionHistoryEntry | null {
  const row = toRecord(value);
  const result = faction(row.result);
  const missionIndex = numberValue(row.missionIndex);
  if (result === null || missionIndex === null) {
    return null;
  }
  return { missionIndex, team: stringArray(row.team), naziVoteCount: numberValue(row.naziVotes) ?? 0, result };
}

export function parseConfidenceHistoryEntry(value: unknown): ConfidenceHistoryEntry | null {
  const row = toRecord(value);
  const missionIndex = numberValue(row.missionIndex);
  const approved = boolValue(row.approved);
  if (missionIndex === null || approved === null) {
    return null;
  }
  return { missionIndex, chef: stringValue(row.chef), team: stringArray(row.team), votes: parseConfidenceVotes(row.votes), approved };
}

export function parseGameOver(value: unknown): GameOverState | null {
  const row = toRecord(value);
  const winner = faction(row.winner);
  if (winner === null) {
    return null;
  }
  return { winner, reason: row.reason === "forfeit" ? "forfeit" : "missions", forfeitedBy: stringValue(row.forfeitedBy) };
}

/** Phase serveur (resync) → écran client. */
export function uiPhaseFromServer(value: unknown): UIPhase | null {
  const mapping: Record<string, UIPhase> = {
    table_order: "table_order",
    role_reveal: "role_reveal",
    proposing: "mission_proposal",
    confidence_vote: "confidence_vote",
    confidence_result: "confidence_result",
    mission_vote: "mission_execution",
    mission_result: "mission_result",
    end_game: "end_game",
    replay_waiting: "replay_waiting",
  };
  return typeof value === "string" ? mapping[value] ?? null : null;
}

export const ROOM_CODE_PATTERN = /^[A-Z0-9_-]{3,24}$/;

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

const ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/room not found/, "Cette room n'existe pas (ou plus)."],
  [/room code already exists/, "Ce nom de room est déjà pris."],
  [/room is full/, "La room est complète."],
  [/already started/, "La partie a déjà commencé dans cette room."],
  [/only the host/, "Seul l'hôte peut faire ça."],
  [/only the current chef/, "Seul le chef peut proposer une équipe."],
  [/room code must/, "Code de room invalide : 3 à 24 caractères parmi A-Z, 0-9, _ et -."],
  [/pseudo must be at most/, "Pseudo trop long (20 caractères max)."],
  [/too many actions/, "Trop d'actions, ralentissez."],
  [/engine stopped unexpectedly/, "Le moteur de jeu a planté : retour au salon."],
  [/please vote again/, "Le vote n'a pas pu être compté, votez à nouveau."],
  [/could not start the game/, "La partie n'a pas pu démarrer, confirmez à nouveau."],
  [/opened in another tab/, "Cette place a été ouverte dans un autre onglet."],
  [/server is full/, "Serveur plein, réessayez plus tard."],
  [/no playable ruleset|requires \d+ players/, "Nombre de joueurs incompatible avec les règles choisies."],
];

export function translateError(message: string): string {
  for (const [pattern, translation] of ERROR_TRANSLATIONS) {
    if (pattern.test(message)) {
      return translation;
    }
  }
  return message;
}

export function parseChatMessage(value: unknown): ChatMessage | null {
  const row = toRecord(value);
  const id = stringValue(row.id);
  const playerId = stringValue(row.playerId);
  const text = typeof row.text === "string" ? row.text : null;
  if (id === null || playerId === null || text === null) {
    return null;
  }
  return { id, playerId, pseudo: stringValue(row.pseudo) ?? "?", text, at: numberValue(row.at) ?? Date.now() };
}

// Messages d'erreur du chat, des signalements et des invitations.
ERROR_TRANSLATIONS.push(
  [/message must be 1-/, "Message vide ou trop long (200 caractères max)."],
  [/too many messages/, "Tu envoies trop de messages, ralentis."],
  [/banned from the chat/, "Ton compte ne peut plus écrire dans le chat."],
  [/too many reports/, "Trop de signalements, réessaie plus tard."],
  [/only invite your friends/, "Tu ne peux inviter que tes amis."],
  [/only possible from the lobby/, "Les invitations se font depuis le salon d'attente."],
  [/friend is offline/, "Cet ami n'est pas en ligne."],
  [/log in to invite/, "Connecte-toi pour inviter tes amis."],
);
