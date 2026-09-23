import type { ConfidenceVote, MissionVote } from "./types";

// Un validateur par champ de payload client : tout ce qui vient du socket est `unknown`.

export const ROOM_CODE_PATTERN = /^[A-Z0-9_-]{3,24}$/;
export const PSEUDO_MAX_LENGTH = 20;
const PLAYER_UID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
// Caractères de contrôle et de mise en forme invisibles (zero-width, bidi).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f]", "g");

export function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

/** Code de room normalisé (majuscules, espaces → tirets) ou undefined s'il est absent/vide. */
export function parseOptionalRoomCode(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "string") {
    throw new Error("room code must be a string");
  }
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, "-");
  if (normalized.length === 0) {
    return undefined;
  }
  if (!ROOM_CODE_PATTERN.test(normalized)) {
    throw new Error("room code must contain only A-Z, 0-9, _, - and be 3-24 chars long");
  }
  return normalized;
}

export function parseRoomCode(raw: unknown): string {
  const code = parseOptionalRoomCode(raw);
  if (code === undefined) {
    throw new Error("room code is required");
  }
  return code;
}

export function parseOptionalPseudo(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "string") {
    throw new Error("pseudo must be a string");
  }
  const cleaned = raw.replace(CONTROL_CHARS, "").trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) {
    return undefined;
  }
  if ([...cleaned].length > PSEUDO_MAX_LENGTH) {
    throw new Error(`pseudo must be at most ${PSEUDO_MAX_LENGTH} characters`);
  }
  return cleaned;
}

export function parsePseudo(raw: unknown): string {
  const pseudo = parseOptionalPseudo(raw);
  if (pseudo === undefined) {
    throw new Error("pseudo must be a non-empty string");
  }
  return pseudo;
}

/**
 * Secret de reconnexion généré par le client. Il n'est jamais renvoyé ni diffusé :
 * c'est la seule façon de reprendre un siège.
 */
export function parseOptionalPlayerUid(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  if (typeof raw !== "string" || !PLAYER_UID_PATTERN.test(raw)) {
    throw new Error("playerUid must be 16-128 characters of A-Z, a-z, 0-9, _ or -");
  }
  return raw;
}

export function parseTeam(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > 20 || !raw.every((entry) => typeof entry === "string")) {
    throw new Error("team must be an array of player ids");
  }
  return [...(raw as string[])];
}

export function parseConfidenceVote(raw: unknown): ConfidenceVote {
  if (raw !== "yes" && raw !== "no") {
    throw new Error("invalid confidence vote");
  }
  return raw;
}

export function parseMissionVote(raw: unknown): MissionVote {
  if (raw !== "nazi" && raw !== "communist") {
    throw new Error("invalid mission vote");
  }
  return raw;
}

export function parsePosition(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new Error("position must be a number");
  }
  return Math.max(1, Math.floor(raw));
}

export function parseReplayChoice(raw: unknown): "replay" | "quit" {
  if (raw !== "replay" && raw !== "quit") {
    throw new Error("choice must be replay or quit");
  }
  return raw;
}

export function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
