// État de jeu côté client : un reducer pur, alimenté par les événements serveur.
import { SERVER_EVENTS } from "./events";
import {
  factionMap,
  numberValue,
  parseConfidenceHistoryEntry,
  parseConfidenceVotes,
  parseGameOver,
  parseMissionHistoryEntry,
  parseRoom,
  parseScores,
  stringArray,
  stringValue,
  toRecord,
  translateError,
  uiPhaseFromServer,
} from "./protocol";
import type {
  ConfidenceHistoryEntry,
  ConfidenceState,
  ConnectionStatus,
  Faction,
  GameMetaState,
  GameOverState,
  MissionHistoryEntry,
  MissionState,
  MyProgress,
  ProposalState,
  RoleAssignment,
  RoomPlayer,
  RoomStatus,
  ScoreState,
  TableOrderState,
  UIPhase,
} from "./types";

export interface GameState {
  pseudo: string;
  roomCode: string;
  myId: string | null;
  hostId: string | null;
  targetPlayerCount: number;
  players: RoomPlayer[];
  roomStatus: RoomStatus | null;
  phase: UIPhase;
  connection: ConnectionStatus;
  error: { message: string; code: string | null; id: number } | null;
  tableOrderCount: number;
  tableOrder: TableOrderState;
  turnOrder: string[];
  role: RoleAssignment;
  proposal: ProposalState;
  confidence: ConfidenceState;
  confidenceHistory: ConfidenceHistoryEntry[];
  mission: MissionState;
  gameMeta: GameMetaState;
  missionHistory: MissionHistoryEntry[];
  score: ScoreState;
  gameOver: GameOverState | null;
  revealedRoles: Record<string, Faction>;
  myProgress: MyProgress;
}

export type GameAction =
  | { type: "server"; event: string; payload: unknown }
  | { type: "set_pseudo"; pseudo: string }
  | { type: "navigate"; phase: UIPhase }
  | { type: "connection"; status: ConnectionStatus }
  | { type: "error"; message: string; code?: string }
  | { type: "clear_error" }
  | { type: "left_room" };

const EMPTY_SCORE: ScoreState = { nazi: 0, communist: 0 };
const EMPTY_MISSION: MissionState = { team: [], naziVoteCount: null, result: null, votesSubmitted: 0, votesRequired: 0, submittedPlayerIds: [] };
const EMPTY_PROGRESS: MyProgress = { votedConfidence: false, votedMission: false, confirmed: false };
const GAME_PHASES: UIPhase[] = [
  "table_order",
  "role_reveal",
  "mission_proposal",
  "confidence_vote",
  "confidence_result",
  "mission_execution",
  "mission_result",
  "end_game",
  "replay_waiting",
];

let errorCounter = 0;

function gameReset(): Pick<
  GameState,
  | "tableOrderCount"
  | "tableOrder"
  | "turnOrder"
  | "role"
  | "proposal"
  | "confidence"
  | "confidenceHistory"
  | "mission"
  | "missionHistory"
  | "score"
  | "gameOver"
  | "revealedRoles"
  | "myProgress"
> {
  return {
    tableOrderCount: 0,
    tableOrder: { order: [], confirmed: [] },
    turnOrder: [],
    role: { faction: null, roleMap: {} },
    proposal: { chefId: null, teamSize: 0, proposedTeam: [] },
    confidence: { votes: {}, approved: null },
    confidenceHistory: [],
    mission: EMPTY_MISSION,
    missionHistory: [],
    score: EMPTY_SCORE,
    gameOver: null,
    revealedRoles: {},
    myProgress: EMPTY_PROGRESS,
  };
}

export function initialGameState(pseudo: string, roomCode: string): GameState {
  return {
    pseudo,
    roomCode,
    myId: null,
    hostId: null,
    targetPlayerCount: 5,
    players: [],
    roomStatus: null,
    phase: pseudo.trim() === "" ? "pseudo_entry" : "landing",
    connection: "idle",
    error: null,
    gameMeta: { missionCount: 0 },
    ...gameReset(),
  };
}

export function isGamePhase(phase: UIPhase): boolean {
  return GAME_PHASES.includes(phase);
}

/** Change de phase ; ce que le joueur « a déjà fait » ne vaut que pour une phase donnée. */
function withPhase(state: GameState, phase: UIPhase): GameState {
  return phase === state.phase ? state : { ...state, phase, myProgress: EMPTY_PROGRESS };
}

function applyRoom(state: GameState, payload: unknown): GameState {
  const room = parseRoom(payload);
  return {
    ...state,
    roomCode: room.code ?? state.roomCode,
    players: room.players.length > 0 ? room.players : state.players,
    hostId: room.hostId ?? state.hostId,
    targetPlayerCount: room.targetPlayerCount ?? state.targetPlayerCount,
    roomStatus: room.status ?? state.roomStatus,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "set_pseudo":
      return { ...state, pseudo: action.pseudo };
    case "navigate":
      return { ...withPhase(state, action.phase), error: null };
    case "connection":
      return { ...state, connection: action.status };
    case "error":
      return { ...state, error: { message: action.message, code: action.code ?? null, id: ++errorCounter } };
    case "clear_error":
      return { ...state, error: null };
    case "left_room":
      return {
        ...state,
        ...gameReset(),
        roomCode: "",
        myId: null,
        hostId: null,
        players: [],
        roomStatus: null,
        targetPlayerCount: 5,
        phase: state.pseudo.trim() === "" ? "pseudo_entry" : "landing",
      };
    case "server":
      return applyServerEvent(state, action.event, action.payload);
    default:
      return state;
  }
}

function applyServerEvent(state: GameState, event: string, raw: unknown): GameState {
  const payload = toRecord(raw);

  switch (event) {
    case SERVER_EVENTS.ROOM_JOINED: {
      const next = { ...applyRoom(state, raw), myId: stringValue(payload.playerId) ?? state.myId, error: null };
      if (next.roomStatus === "waiting") {
        return withPhase({ ...next, ...gameReset() }, "waiting_room");
      }
      if (next.roomStatus === "finished" && !isGamePhase(next.phase)) {
        return withPhase(next, "replay_waiting");
      }
      // En partie : le resync qui suit restaure l'écran.
      return next;
    }

    case SERVER_EVENTS.ROOM_UPDATED: {
      const next = applyRoom(state, raw);
      // Plus de partie en cours (abandon, retour au salon pour compléter) : on quitte l'écran de jeu.
      if (next.roomStatus === "waiting" && isGamePhase(next.phase)) {
        return withPhase({ ...next, ...gameReset() }, "waiting_room");
      }
      return next;
    }

    case SERVER_EVENTS.PLAYER_LEFT: {
      const playerId = stringValue(payload.playerId);
      return playerId === null ? state : { ...state, players: state.players.filter((player) => player.id !== playerId) };
    }

    case SERVER_EVENTS.PLAYER_AFK: {
      const playerId = stringValue(payload.playerId);
      return playerId === null
        ? state
        : { ...state, players: state.players.map((player) => (player.id === playerId ? { ...player, isAfk: true } : player)) };
    }

    case SERVER_EVENTS.GAME_STARTED:
      return withPhase({ ...state, ...gameReset(), roomStatus: "table_order" }, "table_order");

    case SERVER_EVENTS.GAME_ABORTED:
      return withPhase({ ...state, ...gameReset(), roomStatus: "waiting" }, "waiting_room");

    case SERVER_EVENTS.TABLE_ORDER_UPDATED:
      return {
        ...state,
        tableOrderCount: numberValue(payload.taps) ?? stringArray(payload.order).length,
        tableOrder: { order: stringArray(payload.order), confirmed: stringArray(payload.confirmed) },
      };

    case SERVER_EVENTS.ROLE_ASSIGNED: {
      const roleMap = factionMap(payload.roleMap);
      const role = payload.role === "nazi" || payload.role === "communist" ? payload.role : null;
      const turnOrder = stringArray(payload.turnOrder);
      return withPhase(
        {
          ...state,
          role: { faction: role, roleMap },
          turnOrder: turnOrder.length > 0 ? turnOrder : state.turnOrder,
          tableOrder: turnOrder.length > 0 ? { order: turnOrder, confirmed: turnOrder } : state.tableOrder,
        },
        "role_reveal",
      );
    }

    case SERVER_EVENTS.PROPOSAL_PHASE: {
      const team = stringArray(payload.team);
      const next: GameState = {
        ...state,
        proposal: {
          chefId: stringValue(payload.chef),
          teamSize: numberValue(payload.missionSize) ?? 0,
          proposedTeam: team,
          missionIndex: numberValue(payload.missionIndex) ?? undefined,
        },
      };
      // Une proposition avec équipe annonce le vote de confiance (confidence_phase suit).
      return team.length > 0 ? next : withPhase({ ...next, confidence: { votes: {}, approved: null } }, "mission_proposal");
    }

    case SERVER_EVENTS.CONFIDENCE_PHASE: {
      const team = stringArray(payload.team);
      return withPhase(
        {
          ...state,
          proposal: team.length > 0 ? { ...state.proposal, proposedTeam: team } : state.proposal,
          confidence: { votes: {}, approved: null },
        },
        "confidence_vote",
      );
    }

    case SERVER_EVENTS.CONFIDENCE_REVEALED: {
      const votes = parseConfidenceVotes(payload.votes);
      const approved = payload.approved === true;
      return withPhase(
        {
          ...state,
          confidence: { votes, approved },
          confidenceHistory: [
            ...state.confidenceHistory,
            {
              missionIndex: state.proposal.missionIndex ?? state.missionHistory.length + 1,
              chef: state.proposal.chefId,
              team: state.proposal.proposedTeam,
              votes,
              approved,
            },
          ],
        },
        "confidence_result",
      );
    }

    case SERVER_EVENTS.MISSION_PHASE:
      return withPhase({ ...state, mission: { ...EMPTY_MISSION, ...parseProgress(payload) } }, "mission_execution");

    case SERVER_EVENTS.MISSION_PROGRESS:
      return { ...state, mission: { ...state.mission, ...parseProgress(payload) } };

    case SERVER_EVENTS.MISSION_REVEALED: {
      const entry = parseMissionHistoryEntry(raw);
      if (entry === null) {
        return state;
      }
      return withPhase(
        {
          ...state,
          score: parseScores(payload.scores) ?? state.score,
          mission: {
            ...state.mission,
            team: entry.team,
            naziVoteCount: entry.naziVoteCount,
            result: entry.result,
            votesSubmitted: entry.team.length,
            submittedPlayerIds: entry.team,
          },
          missionHistory: [...state.missionHistory, entry],
        },
        "mission_result",
      );
    }

    case SERVER_EVENTS.GAME_OVER:
      return withPhase({ ...state, gameOver: parseGameOver(raw), score: parseScores(payload.scores) ?? state.score }, "end_game");

    case SERVER_EVENTS.ROLES_REVEALED:
      return withPhase({ ...state, revealedRoles: factionMap(payload.roleMap), roomStatus: "finished" }, "replay_waiting");

    case SERVER_EVENTS.RESYNC:
      return applyResync(state, payload);

    case SERVER_EVENTS.ERROR: {
      const message = stringValue(payload.message) ?? "Erreur serveur";
      return { ...state, error: { message: translateError(message), code: stringValue(payload.code), id: ++errorCounter } };
    }

    default:
      return state;
  }
}

function parseProgress(payload: Record<string, unknown>): Pick<MissionState, "team" | "votesSubmitted" | "votesRequired" | "submittedPlayerIds"> {
  const team = stringArray(payload.team);
  return {
    team,
    votesSubmitted: numberValue(payload.votesSubmitted) ?? 0,
    votesRequired: numberValue(payload.votesRequired) ?? team.length,
    submittedPlayerIds: stringArray(payload.submittedPlayerIds),
  };
}

/** Reconstruit tout l'écran à partir de l'état complet envoyé par le serveur. */
function applyResync(state: GameState, payload: Record<string, unknown>): GameState {
  const base = applyRoom(state, payload.room);
  const phase = uiPhaseFromServer(payload.phase) ?? base.phase;
  const roleRaw = toRecord(payload.role);
  const roleFaction = roleRaw.role === "nazi" || roleRaw.role === "communist" ? roleRaw.role : null;
  const proposalRaw = toRecord(payload.proposal);
  const confidenceRaw = payload.confidence === null ? null : toRecord(payload.confidence);
  const missionRaw = payload.mission === null ? null : parseMissionHistoryEntry(payload.mission);
  const progressRaw = payload.missionProgress === null ? null : toRecord(payload.missionProgress);
  const turnOrder = stringArray(payload.turnOrder);

  const mission: MissionState =
    progressRaw !== null
      ? { ...EMPTY_MISSION, ...parseProgress(progressRaw) }
      : missionRaw !== null
        ? {
            team: missionRaw.team,
            naziVoteCount: missionRaw.naziVoteCount,
            result: missionRaw.result,
            votesSubmitted: missionRaw.team.length,
            votesRequired: missionRaw.team.length,
            submittedPlayerIds: missionRaw.team,
          }
        : EMPTY_MISSION;

  return {
    ...base,
    phase,
    gameMeta: { missionCount: numberValue(payload.missionCount) ?? base.gameMeta.missionCount },
    score: parseScores(payload.scores) ?? base.score,
    tableOrderCount: stringArray(payload.tableOrder).length,
    tableOrder: turnOrder.length > 0 && phase !== "table_order"
      ? { order: turnOrder, confirmed: turnOrder }
      : { order: stringArray(payload.tableOrder), confirmed: stringArray(payload.tableOrderConfirmed) },
    turnOrder,
    role: roleFaction === null ? { faction: null, roleMap: {} } : { faction: roleFaction, roleMap: factionMap(roleRaw.roleMap) },
    proposal:
      stringValue(proposalRaw.chef) === null
        ? { chefId: null, teamSize: 0, proposedTeam: [] }
        : {
            chefId: stringValue(proposalRaw.chef),
            teamSize: numberValue(proposalRaw.missionSize) ?? 0,
            proposedTeam: stringArray(proposalRaw.team),
            missionIndex: numberValue(proposalRaw.missionIndex) ?? undefined,
          },
    confidence:
      confidenceRaw === null
        ? { votes: {}, approved: null }
        : { votes: parseConfidenceVotes(confidenceRaw.votes), approved: confidenceRaw.approved === true },
    confidenceHistory: Array.isArray(payload.confidenceHistory)
      ? payload.confidenceHistory.map(parseConfidenceHistoryEntry).filter((entry): entry is ConfidenceHistoryEntry => entry !== null)
      : base.confidenceHistory,
    missionHistory: Array.isArray(payload.missionHistory)
      ? payload.missionHistory.map(parseMissionHistoryEntry).filter((entry): entry is MissionHistoryEntry => entry !== null)
      : base.missionHistory,
    mission,
    gameOver: payload.gameOver === null ? null : parseGameOver(payload.gameOver),
    myProgress: {
      votedConfidence: payload.hasVotedConfidence === true,
      votedMission: payload.hasVotedMission === true,
      confirmed: payload.hasConfirmed === true,
    },
  };
}
