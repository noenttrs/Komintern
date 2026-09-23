export type Faction = "nazi" | "communist";

export type MissionVote = "nazi" | "communist";

export type ConfidenceVote = "yes" | "no";

export type RoundPhase = "proposing" | "voting" | "mission";

export type FlowPhase =
  | "waiting"
  | "table_order"
  | "role_reveal"
  | "revealing"
  | "proposing"
  | "confidence_vote"
  | "confidence_result"
  | "mission_vote"
  | "mission_result"
  | "end_game"
  | "replay_waiting";

export type Role = Faction;

export type RoleMap = Record<string, Role>;

export interface PlayerSummary {
  playerId: string;
  pseudo: string;
  isHost: boolean;
  isAfk: boolean;
}

export interface RoomUpdatedPayload {
  players: PlayerSummary[];
  code: string;
}

export interface TableOrderUpdatedPayload {
  taps: number;
  playerCount: number;
  completed?: boolean;
  order?: string[];
  confirmed?: string[];
}

export interface RoleAssignedPayload {
  role: Role;
  roleMap?: RoleMap;
}

export interface ProposalPhasePayload {
  chef: string;
  missionSize: number;
  missionIndex: number;
}

export interface ConfidenceVoteRecord {
  playerId: string;
  vote: ConfidenceVote;
}

export interface ConfidenceRevealedPayload {
  votes: ConfidenceVoteRecord[];
  result: ConfidenceVote;
}

export interface MissionRevealedPayload {
  team?: string[];
  naziVotes: number;
  result: Faction;
  scores: Scores;
}

export interface MissionProgressPayload {
  votesSubmitted: number;
  votesRequired: number;
  team: string[];
  submittedPlayerIds: string[];
}

export interface Scores {
  nazi: number;
  communist: number;
}

export interface GameOverPayload {
  winner: Faction;
}

export interface RolesRevealedPayload {
  roleMap: RoleMap;
}

export interface PlayerAfkPayload {
  playerId: string;
}

export interface ResyncPayload {
  room: RoomUpdatedPayload;
  phase: FlowPhase;
  missionCount: number;
  tableOrder: string[];
  tableOrderConfirmed?: string[];
  role: RoleAssignedPayload | null;
  proposal: ProposalPhasePayload | null;
  confidence: ConfidenceRevealedPayload | null;
  mission: MissionRevealedPayload | null;
  missionProgress?: MissionProgressPayload | null;
  gameOver: GameOverPayload | null;
}

export interface PlayerView {
  [playerId: string]: Faction;
}

export interface BridgeCommand {
  command: string;
  args: Record<string, unknown>;
}

export interface BridgeResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface RoomState {
  roomId: string;
  playerIds: string[];
  hostPlayerId: string | null;
  chefCursor: number;
  targetPlayerCount: number;
  status: "waiting" | "table_order" | "revealing" | "playing" | "finished";
}

export interface RoundStateLike {
  phase: string;
  chef_id: string;
  proposed_team: string[];
  confidence_votes: Record<string, string>;
  mission_votes: string[];
}
