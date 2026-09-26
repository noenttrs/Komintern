export type Faction = "nazi" | "communist";

export type MissionVote = "nazi" | "communist";

export type ConfidenceVote = "yes" | "no";

export type FlowPhase =
  | "waiting"
  | "table_order"
  | "role_reveal"
  | "proposing"
  | "confidence_vote"
  | "confidence_result"
  | "mission_vote"
  | "mission_result"
  | "end_game"
  | "replay_waiting"
  | "duel_vote";

export type RoleMap = Record<string, Faction>;

export type PlayerView = Record<string, Faction>;

export type RoomStatus = "waiting" | "table_order" | "playing" | "finished";

export interface PlayerSummary {
  playerId: string;
  pseudo: string;
  isHost: boolean;
  isAfk: boolean;
  isConnected: boolean;
  /** Déconnecté en pleine partie : temps restant avant l'abandon, et qui l'attend éventuellement. */
  /** Absent en pleine partie : depuis quand, et votes pour continuer sans lui (`needed` suffisent). */
  absence: { awayForMs: number; promptAfterMs: number; votes: string[]; needed: number } | null;
}

/** Abonnement Web Push validé (voir push/push.ts). */
export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  lang: "fr" | "en";
}

export interface RoomUpdatedPayload {
  players: PlayerSummary[];
  code: string;
  hostPlayerId: string | null;
  /** Nombre maximal de joueurs (alias historique de maxPlayers). */
  targetPlayerCount: number;
  /** La partie peut démarrer à partir de minPlayers joueurs, jusqu'à maxPlayers. */
  minPlayers: number;
  maxPlayers: number;
  status: RoomStatus;
  /** Faux pour une partie jouée sur place : pas de chat. */
  chatEnabled: boolean;
  /** Listée dans les parties publiques (comptes uniquement). */
  isPublic: boolean;
  /** Règles libres : partie classique (joueurs ÷ 2 + 1) ou rapide (premier à 3). */
  pace: "classic" | "quick";
  /** Les nazis sont annoncés à la fin de la partie (sinon les rôles restent secrets). */
  revealRoles: boolean;
}

export interface Scores {
  nazi: number;
  communist: number;
}

export interface ConfidenceVoteRecord {
  playerId: string;
  vote: ConfidenceVote;
}

export interface ConfidenceHistoryEntry {
  missionIndex: number;
  chef: string;
  team: string[];
  votes: ConfidenceVoteRecord[];
  approved: boolean;
}

export interface MissionHistoryEntry {
  missionIndex: number;
  team: string[];
  naziVotes: number;
  result: Faction;
}

export interface ResyncPayload {
  room: RoomUpdatedPayload;
  phase: FlowPhase;
  missionCount: number;
  missionSizes: number[];
  scores: Scores;
  tableOrder: string[];
  tableOrderConfirmed: string[];
  turnOrder: string[];
  role: { role: Faction; roleMap?: RoleMap } | null;
  proposal: { chef: string; missionSize: number; missionIndex: number; team: string[] } | null;
  confidence: { votes: ConfidenceVoteRecord[]; result: ConfidenceVote; approved: boolean } | null;
  hasVotedConfidence: boolean;
  hasVotedMission: boolean;
  hasConfirmed: boolean;
  /** Temps restant avant l'enchaînement automatique de l'écran en cours (ms), ou null. */
  autoAdvanceMs?: number | null;
  mission: (MissionHistoryEntry & { scores: Scores }) | null;
  missionProgress: { team: string[]; votesSubmitted: number; votesRequired: number; submittedPlayerIds: string[] } | null;
  confidenceHistory: ConfidenceHistoryEntry[];
  missionHistory: MissionHistoryEntry[];
  gameOver: { winner: Faction; reason: "missions" | "forfeit"; forfeitedBy?: string; roleMap?: RoleMap; scores?: Scores } | null;
  /** Duel à 2 joueurs : qui a déjà voté (jamais le vote lui-même avant le résultat). */
  mode?: "duel";
  duel?: { votedPlayerIds: string[]; hasVoted: boolean };
}
