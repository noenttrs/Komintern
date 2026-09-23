export type Faction = "nazi" | "communist";

export type ConfidenceVote = "yes" | "no";

export type MissionVote = "nazi" | "communist";

export type UIPhase =
  | "pseudo_entry"
  | "landing"
  | "create_room"
  | "join_room"
  | "waiting_room"
  | "table_order"
  | "role_reveal"
  | "mission_proposal"
  | "confidence_vote"
  | "confidence_result"
  | "mission_execution"
  | "mission_result"
  | "end_game"
  | "replay_waiting";

// Seuls les presets dont les tailles de mission sont définies sont jouables.
// Formats de 4 à 11 joueurs (voir docs/regles.md).
export const PLAYABLE_PRESETS = [
  "PRESET_4J",
  "PRESET_5J",
  "PRESET_6J",
  "PRESET_7J",
  "PRESET_8J",
  "PRESET_9J",
  "PRESET_10J",
  "PRESET_11J",
] as const;

export type RulesetPreset = (typeof PLAYABLE_PRESETS)[number];

export type RoomStatus = "waiting" | "table_order" | "playing" | "finished";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected";

export type RulesetInfoMode = "full" | "partial" | "blind";

export interface CustomRuleset {
  player_count: number;
  nazi_count: number;
  communist_count: number;
  mission_sizes: number[];
  mission_count: number;
  win_threshold: number;
  info_mode: RulesetInfoMode;
  experimental: boolean;
}

export interface StartGameVariantConfig {
  ruleset_preset?: RulesetPreset;
  ruleset?: CustomRuleset;
}

export interface RoomPlayer {
  id: string;
  pseudo?: string;
  isHost?: boolean;
  isAfk?: boolean;
  isConnected?: boolean;
}

export interface ProposalState {
  chefId: string | null;
  teamSize: number;
  proposedTeam: string[];
  missionIndex?: number;
}

export interface ConfidenceState {
  votes: Record<string, ConfidenceVote>;
  approved: boolean | null;
}

export interface MissionState {
  team: string[];
  naziVoteCount: number | null;
  result: Faction | null;
  votesSubmitted: number;
  votesRequired: number;
  submittedPlayerIds: string[];
}

export interface GameMetaState {
  missionCount: number;
}

export interface ScoreState {
  nazi: number;
  communist: number;
}

export interface RoleAssignment {
  faction: Faction | null;
  roleMap: Record<string, Faction>;
}

export interface ReplayChoice {
  me: "replay" | "quit" | null;
  byPlayer: Record<string, "replay" | "quit">;
}

export interface ConfidenceHistoryEntry {
  missionIndex: number;
  chef: string | null;
  team: string[];
  votes: Record<string, ConfidenceVote>;
  approved: boolean;
}

export interface MissionHistoryEntry {
  missionIndex: number;
  team: string[];
  naziVoteCount: number;
  result: Faction;
}

/** Ce que ce joueur a déjà fait dans la phase courante (restauré au resync). */
export interface MyProgress {
  votedConfidence: boolean;
  votedMission: boolean;
  confirmed: boolean;
}

export interface GameOverState {
  winner: Faction;
  reason: "missions" | "forfeit";
  forfeitedBy: string | null;
}

export interface TableOrderState {
  order: string[];
  confirmed: string[];
}

export interface ChatMessage {
  id: string;
  playerId: string;
  pseudo: string;
  text: string;
  at: number;
}

export interface RoomInvite {
  id: number;
  code: string;
  fromName: string;
}
