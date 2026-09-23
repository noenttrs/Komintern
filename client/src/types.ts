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

export type RulesetPreset =
  | "PRESET_3J"
  | "PRESET_5J"
  | "PRESET_6J"
  | "PRESET_7J"
  | "PRESET_8J"
  | "PRESET_9J"
  | "PRESET_10J"
  | "PRESET_11J";

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

export type RoundPhase = "proposing" | "voting" | "mission";

export interface PlayerView {
  playerId: string;
  roleMap: Record<string, Faction>;
}

export interface RoundInfo {
  missionNumber: number;
  chefId: string;
  requiredTeamSize: number;
}

export interface ConfidenceResult {
  votes: Record<string, ConfidenceVote>;
  approved: boolean;
}

export interface MissionResult {
  team?: string[];
  votes: MissionVote[];
  winner: Faction;
}

export interface RoomPlayer {
  id: string;
  pseudo?: string;
  isHost?: boolean;
  isAfk?: boolean;
  ready?: boolean;
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
  team: string[];
  votes: Record<string, ConfidenceVote>;
  approved: boolean;
}

export interface MissionHistoryEntry {
  missionIndex: number;
  team: string[];
  naziVoteCount: number;
}

export interface TableOrderState {
  order: string[];
  confirmed: string[];
}
