import { useEffect, useRef, useState } from "react";

import { CLIENT_EVENTS, SERVER_EVENTS } from "../events";
import { socket } from "../socket";
import {
  ConfidenceState,
  ConfidenceVote,
  Faction,
  ConfidenceHistoryEntry,
  GameMetaState,
  MissionState,
  MissionHistoryEntry,
  MissionVote,
  ProposalState,
  ReplayChoice,
  RoleAssignment,
  RoomPlayer,
  ScoreState,
  StartGameVariantConfig,
  TableOrderState,
  UIPhase,
} from "../types";

const ROOM_STORAGE_KEY = "komintern.room_code";
const PSEUDO_STORAGE_KEY = "komintern.pseudo";
const PLAYER_UID_KEY = "komintern.player_uid";

const INITIAL_SCORE: ScoreState = { nazi: 0, communist: 0 };

type Dictionary = Record<string, unknown>;

export interface UseGameSocketResult {
  pseudo: string;
  roomCode: string;
  myId: string | null;
  hostId: string | null;
  targetPlayerCount: number;
  players: RoomPlayer[];
  phase: UIPhase;
  error: string | null;
  tableOrderCount: number;
  tableOrder: TableOrderState;
  role: RoleAssignment;
  proposal: ProposalState;
  confidence: ConfidenceState;
  confidenceHistory: ConfidenceHistoryEntry[];
  mission: MissionState;
  gameMeta: GameMetaState;
  missionHistory: MissionHistoryEntry[];
  score: ScoreState;
  winner: Faction | null;
  revealedRoles: Record<string, Faction>;
  replayChoice: ReplayChoice;
  setPseudo: (value: string) => void;
  confirmPseudo: () => void;
  openPseudoEntry: () => void;
  openCreateRoom: () => void;
  openJoinRoom: () => void;
  backToLanding: () => void;
  createRoom: (options?: { roomName?: string; config?: StartGameVariantConfig | null }) => void;
  startGame: () => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
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
}

function toRecord(value: unknown): Dictionary {
  if (typeof value === "object" && value !== null) {
    return value as Dictionary;
  }
  return {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boolValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function faction(value: unknown): Faction | null {
  if (value === "nazi" || value === "communist") {
    return value;
  }
  if (value === "NAZI") {
    return "nazi";
  }
  if (value === "COMMUNIST") {
    return "communist";
  }
  return null;
}

function inferMyFaction(roleMap: Record<string, Faction>, myId: string | null): Faction | null {
  if (myId === null) {
    return null;
  }
  return roleMap[myId] ?? null;
}

function createRoomCode(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function normalizePreferredRoomCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function readStoredPseudo(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(PSEUDO_STORAGE_KEY) ?? "";
}

function readStoredRoom(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(ROOM_STORAGE_KEY) ?? "";
}

function getOrCreatePlayerUid(): string {
  if (typeof window === "undefined") {
    return "server-side-player";
  }

  const existing = window.localStorage.getItem(PLAYER_UID_KEY);
  if (existing !== null && existing.trim() !== "") {
    return existing;
  }

  const generated = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(PLAYER_UID_KEY, generated);
  return generated;
}

export function useGameSocket(): UseGameSocketResult {
  const [pseudo, setPseudoState] = useState(readStoredPseudo());
  const [roomCode, setRoomCode] = useState(readStoredRoom());
  const [myId, setMyId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [targetPlayerCount, setTargetPlayerCount] = useState(5);
  const [phase, setPhase] = useState<UIPhase>(readStoredPseudo().trim() === "" ? "pseudo_entry" : "landing");
  const [error, setError] = useState<string | null>(null);
  const [tableOrderCount, setTableOrderCount] = useState(0);
  const [tableOrder, setTableOrder] = useState<TableOrderState>({ order: [], confirmed: [] });
  const [role, setRole] = useState<RoleAssignment>({ faction: null, roleMap: {} });
  const [proposal, setProposal] = useState<ProposalState>({ chefId: null, teamSize: 0, proposedTeam: [] });
  const [confidence, setConfidence] = useState<ConfidenceState>({ votes: {}, approved: null });
  const [confidenceHistory, setConfidenceHistory] = useState<ConfidenceHistoryEntry[]>([]);
  const [mission, setMission] = useState<MissionState>({ team: [], naziVoteCount: null, votesSubmitted: 0, votesRequired: 0, submittedPlayerIds: [] });
  const [gameMeta, setGameMeta] = useState<GameMetaState>({ missionCount: 0 });
  const [missionHistory, setMissionHistory] = useState<MissionHistoryEntry[]>([]);
  const [score, setScore] = useState<ScoreState>(INITIAL_SCORE);
  const [winner, setWinner] = useState<Faction | null>(null);
  const [revealedRoles, setRevealedRoles] = useState<Record<string, Faction>>({});
  const [replayChoice, setReplayChoice] = useState<ReplayChoice>({ me: null, byPlayer: {} });
  const playerUidRef = useRef(getOrCreatePlayerUid());

  const roomRef = useRef(roomCode);
  const pseudoRef = useRef(pseudo);

  useEffect(() => {
    roomRef.current = roomCode;
  }, [roomCode]);

  useEffect(() => {
    pseudoRef.current = pseudo;
  }, [pseudo]);

  const safeEmit = (eventName: string, payload?: Dictionary): void => {
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit(eventName, payload ?? {});
  };

  const setPseudo = (value: string): void => {
    setPseudoState(value);
    if (typeof window !== "undefined") {
      if (value.trim() === "") {
        window.localStorage.removeItem(PSEUDO_STORAGE_KEY);
      } else {
        window.localStorage.setItem(PSEUDO_STORAGE_KEY, value);
      }
    }
  };

  const confirmPseudo = (): void => {
    const trimmed = pseudo.trim();
    if (trimmed === "") {
      setError("Pseudo requis");
      setPhase("pseudo_entry");
      return;
    }
    setPseudoState(trimmed);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PSEUDO_STORAGE_KEY, trimmed);
    }
    setError(null);
    setPhase("landing");
  };

  const applyRoomUpdate = (payloadRaw: unknown): void => {
    const payload = toRecord(payloadRaw);
    const selfPlayerId = stringValue(payload.playerId) ?? stringValue(payload.player_id);
    if (selfPlayerId !== null) {
      setMyId(selfPlayerId);
    }
    const idsFromPlayers = stringArray(payload.players);
    const idsFromSnake = stringArray(payload.player_ids);
    const idsFromCamel = stringArray(payload.playerIds);
    const ids = idsFromPlayers.length > 0 ? idsFromPlayers : idsFromSnake.length > 0 ? idsFromSnake : idsFromCamel;

    let playerList: RoomPlayer[] = [];
    if (ids.length > 0) {
      playerList = ids.map((id) => ({ id }));
    } else if (Array.isArray(payload.players)) {
      const parsedPlayers: RoomPlayer[] = [];
      for (const entry of payload.players as unknown[]) {
        const row = toRecord(entry);
        const id = stringValue(row.id) ?? stringValue(row.player_id) ?? stringValue(row.playerId);
        if (id === null) {
          continue;
        }

        const ready = boolValue(row.ready);
        const pseudo = stringValue(row.pseudo) ?? undefined;
        const isHost = boolValue(row.isHost) ?? undefined;
        const isAfk = boolValue(row.isAfk) ?? undefined;

        if (ready === null) {
          parsedPlayers.push({ id, pseudo, isHost, isAfk });
        } else {
          parsedPlayers.push({ id, pseudo, isHost, isAfk, ready });
        }
      }
      playerList = parsedPlayers;
    }

    if (playerList.length > 0) {
      setPlayers(playerList);
    }

    setHostId(
      stringValue(payload.host_id) ??
        stringValue(payload.hostId) ??
        stringValue(payload.host_player_id) ??
        stringValue(payload.hostPlayerId) ??
        playerList.find((entry) => entry.isHost)?.id ??
        null,
    );

    const target = numberValue(payload.targetPlayerCount) ?? numberValue(payload.target_player_count);
    if (target !== null && target > 0) {
      setTargetPlayerCount(target);
    }
  };

  const rejoin = (): void => {
    if (roomRef.current.trim() === "" || pseudoRef.current.trim() === "") {
      return;
    }
    safeEmit(CLIENT_EVENTS.JOIN_ROOM, {
      code: roomRef.current.trim(),
      pseudo: pseudoRef.current.trim(),
      playerUid: playerUidRef.current,
    });
  };

  useEffect(() => {
    if (roomCode.trim() === "" || pseudo.trim() === "") {
      return;
    }
    if (!socket.connected) {
      socket.connect();
    } else {
      rejoin();
    }
  }, []);

  useEffect(() => {
    const onConnect = (): void => {
      rejoin();
    };

    const onRoomUpdated = (payload: unknown): void => {
      applyRoomUpdate(payload);
      setError(null);
      if (phase === "landing" || phase === "create_room" || phase === "join_room") {
        setPhase("waiting_room");
      }
    };

    const onGameStarted = (): void => {
      setPhase("table_order");
      setTableOrderCount(0);
      setTableOrder({ order: [], confirmed: [] });
      setScore(INITIAL_SCORE);
      setWinner(null);
      setRevealedRoles({});
      setReplayChoice({ me: null, byPlayer: {} });
      setConfidenceHistory([]);
      setMissionHistory([]);
      setMission({ team: [], naziVoteCount: null, votesSubmitted: 0, votesRequired: 0, submittedPlayerIds: [] });
    };

    const onTableOrderUpdated = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      const count =
        numberValue(payload.taps) ??
        numberValue(payload.tapped_count) ??
        numberValue(payload.tappedCount) ??
        stringArray(payload.tapped_player_ids).length ??
        stringArray(payload.tappedPlayerIds).length;
      setTableOrderCount(count);
      setTableOrder({
        order: stringArray(payload.order),
        confirmed: stringArray(payload.confirmed),
      });

      const total = numberValue(payload.playerCount) ?? players.length;
      const done =
        boolValue(payload.completed) ??
        (count > 0 && total > 0 && count >= total);
      if (done && stringArray(payload.confirmed).length >= total && total > 0) {
        setPhase("role_reveal");
      }
    };

    const onRoleAssigned = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      const roleMapRaw = toRecord(payload.role_map ?? payload.roleMap);
      const roleMap: Record<string, Faction> = {};
      for (const [id, value] of Object.entries(roleMapRaw)) {
        const parsed = faction(value);
        if (parsed !== null) {
          roleMap[id] = parsed;
        }
      }

      const claimedMyId = stringValue(payload.player_id) ?? stringValue(payload.playerId);
      if (claimedMyId !== null) {
        setMyId(claimedMyId);
      }

      const directFaction = faction(payload.faction ?? payload.role);
      setRole({ faction: directFaction ?? inferMyFaction(roleMap, claimedMyId ?? myId), roleMap });
    };

    const onProposalPhase = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      const chefId = stringValue(payload.chef_id) ?? stringValue(payload.chefId) ?? stringValue(payload.chef);
      const teamSize =
        numberValue(payload.team_size) ??
        numberValue(payload.teamSize) ??
        numberValue(payload.missionSize) ??
        0;
      const proposedTeam = stringArray(payload.team);
      const missionIndex = numberValue(payload.missionIndex);
      setProposal({ chefId, teamSize, proposedTeam, missionIndex: missionIndex ?? undefined });
      setConfidence({ votes: {}, approved: null });
      setMission((current) => ({ ...current, team: proposedTeam.length > 0 ? proposedTeam : current.team }));
      setPhase("mission_proposal");
    };

    const onConfidencePhase = (): void => {
      setConfidence({ votes: {}, approved: null });
      setPhase("confidence_vote");
    };

    const onConfidenceRevealed = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      const votesRaw = payload.votes;
      const votes: Record<string, ConfidenceVote> = {};

      if (Array.isArray(votesRaw)) {
        for (const entry of votesRaw) {
          const row = toRecord(entry);
          const id = stringValue(row.player_id) ?? stringValue(row.playerId);
          const vote = row.vote;
          if (id !== null && (vote === "yes" || vote === "no")) {
            votes[id] = vote;
          }
        }
      } else {
        for (const [id, vote] of Object.entries(toRecord(votesRaw))) {
          if (vote === "yes" || vote === "no") {
            votes[id] = vote;
          }
        }
      }

      const approved =
        boolValue(payload.approved) ??
        (payload.result === "yes" ? true : payload.result === "no" ? false : payload.outcome === "yes");
      setConfidence({ votes, approved });
      setConfidenceHistory((current) => [
        ...current,
        {
          missionIndex: proposal.missionIndex ?? Math.max(1, current.length + 1),
          team: proposal.proposedTeam,
          votes,
          approved,
        },
      ]);
      setPhase("confidence_result");
    };

    const onMissionPhase = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      const team = stringArray(payload.team);
      const votesRequired = numberValue(payload.votesRequired) ?? team.length;
      const votesSubmitted = numberValue(payload.votesSubmitted) ?? 0;
      const submittedPlayerIds = stringArray(payload.submittedPlayerIds);
      setMission({ team, naziVoteCount: null, votesSubmitted, votesRequired, submittedPlayerIds });
      setPhase("mission_execution");
    };

    const onMissionProgress = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      const team = stringArray(payload.team);
      const votesSubmitted = numberValue(payload.votesSubmitted) ?? 0;
      const votesRequired = numberValue(payload.votesRequired) ?? team.length;
      const submittedPlayerIds = stringArray(payload.submittedPlayerIds);
      setMission((current) => ({
        ...current,
        team: team.length > 0 ? team : current.team,
        votesSubmitted,
        votesRequired,
        submittedPlayerIds: submittedPlayerIds.length > 0 ? submittedPlayerIds : current.submittedPlayerIds,
      }));
    };

    const onMissionRevealed = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      const team = stringArray(payload.team);
      const naziCount = numberValue(payload.naziVotes) ?? numberValue(payload.nazi_vote_count) ?? numberValue(payload.naziVoteCount);
      const scoreRaw = toRecord(payload.score ?? payload.scores);
      const naziScore = numberValue(scoreRaw.nazi);
      const communistScore = numberValue(scoreRaw.communist);
      if (naziScore !== null && communistScore !== null) {
        setScore({ nazi: naziScore, communist: communistScore });
      }

      setMission((current) => ({
        ...current,
        team: team.length > 0 ? team : current.team,
        naziVoteCount: naziCount,
        votesSubmitted: current.votesRequired,
        submittedPlayerIds: team.length > 0 ? [...team] : [...current.team],
      }));
      setMissionHistory((current) => [
        ...current,
        {
          missionIndex: proposal.missionIndex ?? Math.max(1, current.length + 1),
          team: team.length > 0 ? team : mission.team,
          naziVoteCount: naziCount ?? 0,
        },
      ]);
      setPhase("mission_result");
    };

    const onResync = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      applyRoomUpdate(payload.room);

      const phaseRaw = stringValue(payload.phase);
      const missionCount = numberValue(payload.missionCount);
      if (missionCount !== null) {
        setGameMeta({ missionCount });
      }
      if (phaseRaw === "table_order") {
        setPhase("table_order");
      } else if (phaseRaw === "role_reveal") {
              setTableOrder({
                order: stringArray(payload.tableOrder),
                confirmed: stringArray(payload.tableOrderConfirmed),
              });

        setPhase("role_reveal");
      } else if (phaseRaw === "proposing") {
        setPhase("mission_proposal");
      } else if (phaseRaw === "confidence_vote") {
        setPhase("confidence_vote");
      } else if (phaseRaw === "confidence_result") {
        setPhase("confidence_result");
      } else if (phaseRaw === "mission_vote") {
        setPhase("mission_execution");
      } else if (phaseRaw === "mission_result") {
        setPhase("mission_result");
      } else if (phaseRaw === "end_game") {
        setPhase("end_game");
      } else if (phaseRaw === "replay_waiting") {
        setPhase("replay_waiting");
      }

      const proposalRaw = toRecord(payload.proposal);
      const chef = stringValue(proposalRaw.chef);
      const missionSize = numberValue(proposalRaw.missionSize) ?? 0;
      const missionIndex = numberValue(proposalRaw.missionIndex) ?? 0;
      if (chef !== null && missionSize > 0) {
        setProposal({
          chefId: chef,
          teamSize: missionSize,
          proposedTeam: missionIndex > 0 ? [] : [],
          missionIndex: missionIndex > 0 ? missionIndex : undefined,
        });
      }

      const missionRaw = toRecord(payload.mission);
      const missionScoreRaw = toRecord(missionRaw.scores);
      const naziScore = numberValue(missionScoreRaw.nazi);
      const communistScore = numberValue(missionScoreRaw.communist);
      if (naziScore !== null && communistScore !== null) {
        setScore({ nazi: naziScore, communist: communistScore });
      }

      const missionTeam = stringArray(missionRaw.team);
      const missionNaziVotes = numberValue(missionRaw.naziVotes) ?? numberValue(missionRaw.nazi_vote_count) ?? numberValue(missionRaw.naziVoteCount);
      if (missionTeam.length > 0 || missionNaziVotes !== null) {
        setMission((current) => ({
          ...current,
          team: missionTeam.length > 0 ? missionTeam : current.team,
          naziVoteCount: missionNaziVotes ?? current.naziVoteCount,
          votesSubmitted: missionTeam.length > 0 ? missionTeam.length : current.votesSubmitted,
          votesRequired: missionTeam.length > 0 ? missionTeam.length : current.votesRequired,
          submittedPlayerIds: missionTeam.length > 0 ? missionTeam : current.submittedPlayerIds,
        }));
      }

      const missionProgressRaw = toRecord(payload.missionProgress);
      const progressVotesSubmitted = numberValue(missionProgressRaw.votesSubmitted);
      const progressVotesRequired = numberValue(missionProgressRaw.votesRequired);
      const progressTeam = stringArray(missionProgressRaw.team);
      const progressSubmittedPlayerIds = stringArray(missionProgressRaw.submittedPlayerIds);
      if (progressVotesSubmitted !== null || progressVotesRequired !== null || progressTeam.length > 0) {
        setMission((current) => ({
          ...current,
          team: progressTeam.length > 0 ? progressTeam : current.team,
          votesSubmitted: progressVotesSubmitted ?? current.votesSubmitted,
          votesRequired: progressVotesRequired ?? current.votesRequired,
          submittedPlayerIds: progressSubmittedPlayerIds.length > 0 ? progressSubmittedPlayerIds : current.submittedPlayerIds,
        }));
      }

      const gameOverRaw = toRecord(payload.gameOver);
      const winnerRaw = faction(gameOverRaw.winner);
      if (winnerRaw !== null) {
        setWinner(winnerRaw);
      }
    };

    const onPlayerAfk = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      const playerId = stringValue(payload.playerId);
      if (playerId === null) {
        return;
      }

      setPlayers((current) =>
        current.map((entry) => (entry.id === playerId ? { ...entry, isAfk: true } : entry)),
      );
    };

    const onGameOver = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      setWinner(faction(payload.winner));
      setPhase("end_game");
    };

    const onRolesRevealed = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      const next: Record<string, Faction> = {};
      for (const [id, value] of Object.entries(toRecord(payload.roles ?? payload.role_map ?? payload.roleMap))) {
        const parsed = faction(value);
        if (parsed !== null) {
          next[id] = parsed;
        }
      }
      setRevealedRoles(next);
      setPhase("replay_waiting");
    };

    const onError = (payloadRaw: unknown): void => {
      const payload = toRecord(payloadRaw);
      setError(stringValue(payload.message) ?? "Socket error");
    };

    socket.on("connect", onConnect);
    socket.on(SERVER_EVENTS.ROOM_UPDATED, onRoomUpdated);
    socket.on(SERVER_EVENTS.GAME_STARTED, onGameStarted);
    socket.on(SERVER_EVENTS.RESYNC, onResync);
    socket.on(SERVER_EVENTS.PLAYER_AFK, onPlayerAfk);
    socket.on(SERVER_EVENTS.TABLE_ORDER_UPDATED, onTableOrderUpdated);
    socket.on(SERVER_EVENTS.ROLE_ASSIGNED, onRoleAssigned);
    socket.on(SERVER_EVENTS.PROPOSAL_PHASE, onProposalPhase);
    socket.on(SERVER_EVENTS.CONFIDENCE_PHASE, onConfidencePhase);
    socket.on(SERVER_EVENTS.CONFIDENCE_REVEALED, onConfidenceRevealed);
    socket.on(SERVER_EVENTS.MISSION_PHASE, onMissionPhase);
    socket.on(SERVER_EVENTS.MISSION_PROGRESS, onMissionProgress);
    socket.on(SERVER_EVENTS.MISSION_REVEALED, onMissionRevealed);
    socket.on(SERVER_EVENTS.GAME_OVER, onGameOver);
    socket.on(SERVER_EVENTS.ROLES_REVEALED, onRolesRevealed);
    socket.on(SERVER_EVENTS.ERROR, onError);

    return () => {
      socket.off("connect", onConnect);
      socket.off(SERVER_EVENTS.ROOM_UPDATED, onRoomUpdated);
      socket.off(SERVER_EVENTS.GAME_STARTED, onGameStarted);
      socket.off(SERVER_EVENTS.RESYNC, onResync);
      socket.off(SERVER_EVENTS.PLAYER_AFK, onPlayerAfk);
      socket.off(SERVER_EVENTS.TABLE_ORDER_UPDATED, onTableOrderUpdated);
      socket.off(SERVER_EVENTS.ROLE_ASSIGNED, onRoleAssigned);
      socket.off(SERVER_EVENTS.PROPOSAL_PHASE, onProposalPhase);
      socket.off(SERVER_EVENTS.CONFIDENCE_PHASE, onConfidencePhase);
      socket.off(SERVER_EVENTS.CONFIDENCE_REVEALED, onConfidenceRevealed);
      socket.off(SERVER_EVENTS.MISSION_PHASE, onMissionPhase);
      socket.off(SERVER_EVENTS.MISSION_PROGRESS, onMissionProgress);
      socket.off(SERVER_EVENTS.MISSION_REVEALED, onMissionRevealed);
      socket.off(SERVER_EVENTS.GAME_OVER, onGameOver);
      socket.off(SERVER_EVENTS.ROLES_REVEALED, onRolesRevealed);
      socket.off(SERVER_EVENTS.ERROR, onError);
    };
  }, [myId, phase, players.length]);

  const createRoom = (options?: { roomName?: string; config?: StartGameVariantConfig | null }): void => {
    const trimmedPseudo = pseudo.trim();
    if (trimmedPseudo === "") {
      setError("Pseudo requis");
      return;
    }

    const preferredCodeRaw = options?.roomName?.trim() ?? "";
    const code = preferredCodeRaw === "" ? createRoomCode() : normalizePreferredRoomCode(preferredCodeRaw);
    setRoomCode(code);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ROOM_STORAGE_KEY, code);
    }

    const config = options?.config;

    safeEmit(CLIENT_EVENTS.CREATE_ROOM, {
      code,
      ...(config?.ruleset_preset ? { ruleset_preset: config.ruleset_preset } : {}),
      ...(config?.ruleset ? { ruleset: config.ruleset } : {}),
      playerUid: playerUidRef.current,
      pseudo: trimmedPseudo,
    });
    setPhase("waiting_room");
    setError(null);
  };

  const joinRoom = (code: string): void => {
    const trimmedPseudo = pseudo.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (trimmedPseudo === "" || trimmedCode === "") {
      setError("Pseudo et code room requis");
      return;
    }

    setRoomCode(trimmedCode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ROOM_STORAGE_KEY, trimmedCode);
    }

    safeEmit(CLIENT_EVENTS.JOIN_ROOM, {
      code: trimmedCode,
      pseudo: trimmedPseudo,
      playerUid: playerUidRef.current,
    });
    setPhase("waiting_room");
    setError(null);
  };

  const leaveRoom = (): void => {
    safeEmit(CLIENT_EVENTS.LEAVE_ROOM);
    setRoomCode("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ROOM_STORAGE_KEY);
    }
    setPlayers([]);
    setTargetPlayerCount(5);
    setHostId(null);
    setPhase(pseudo.trim() === "" ? "pseudo_entry" : "landing");
    setRole({ faction: null, roleMap: {} });
    setProposal({ chefId: null, teamSize: 0, proposedTeam: [] });
    setConfidence({ votes: {}, approved: null });
    setMission({ team: [], naziVoteCount: null, votesSubmitted: 0, votesRequired: 0, submittedPlayerIds: [] });
    setGameMeta({ missionCount: 0 });
    setScore(INITIAL_SCORE);
    setWinner(null);
    setRevealedRoles({});
    setReplayChoice({ me: null, byPlayer: {} });
    setError(null);
  };

  return {
    pseudo,
    roomCode,
    myId,
    hostId,
    targetPlayerCount,
    players,
    phase,
    error,
    tableOrderCount,
    tableOrder,
    role,
    proposal,
    confidence,
    confidenceHistory,
    mission,
    gameMeta,
    missionHistory,
    score,
    winner,
    revealedRoles,
    replayChoice,
    setPseudo,
    confirmPseudo,
    openPseudoEntry: () => {
      setError(null);
      setPhase("pseudo_entry");
    },
    openCreateRoom: () => {
      setError(null);
      setPhase("create_room");
    },
    openJoinRoom: () => {
      setError(null);
      setPhase("join_room");
    },
    backToLanding: () => {
      setError(null);
      setPhase("landing");
    },
    createRoom,
    startGame: () => safeEmit(CLIENT_EVENTS.START_GAME),
    joinRoom,
    leaveRoom,
    tableOrderTap: () => safeEmit(CLIENT_EVENTS.TABLE_ORDER_TAP),
    adjustTableOrder: (position) => safeEmit(CLIENT_EVENTS.TABLE_ORDER_ADJUST, { position }),
    confirmTableOrder: () => safeEmit(CLIENT_EVENTS.TABLE_ORDER_CONFIRMED),
    resetTableOrder: () => safeEmit(CLIENT_EVENTS.TABLE_ORDER_BACK),
    confirmRole: () => safeEmit(CLIENT_EVENTS.ROLE_CONFIRMED),
    proposeTeam: (team) => safeEmit(CLIENT_EVENTS.PROPOSE_TEAM, { team }),
    sendConfidenceVote: (vote) => safeEmit(CLIENT_EVENTS.CONFIDENCE_VOTE, { vote }),
    confirmConfidenceResult: () => safeEmit(CLIENT_EVENTS.CONFIDENCE_RESULT_CONFIRMED),
    sendMissionVote: (vote) => safeEmit(CLIENT_EVENTS.MISSION_VOTE, { vote }),
    confirmMissionResult: () => safeEmit(CLIENT_EVENTS.MISSION_RESULT_CONFIRMED),
    confirmEndGame: () => safeEmit(CLIENT_EVENTS.END_GAME_CONFIRMED),
    sendReplayChoice: (choice) => {
      setReplayChoice((current) => ({ ...current, me: choice }));
      safeEmit(CLIENT_EVENTS.REPLAY_CHOICE, { choice });
    },
  };
}
