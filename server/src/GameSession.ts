import { Server } from "socket.io";

import { SERVER_EVENTS } from "./events";
import { PythonBridge } from "./PythonBridge";
import type { ResolvedRuleset } from "./rulesets";
import {
  ConfidenceVote,
  Faction,
  FlowPhase,
  MissionVote,
  PlayerView,
  ResyncPayload,
  RoleMap,
  RoundStateLike,
} from "./types";

type PersistCursor = (roomId: string, cursor: number) => void;

type BridgeLike = {
  send(command: string, args: Record<string, unknown>): Promise<unknown>;
  kill?: () => void;
  dispose?: () => void;
};

type SessionConfig = {
  pythonPath: string;
  enginePath: string;
  ruleset: ResolvedRuleset;
  hostPlayerId: string;
  persistCursor: PersistCursor;
  onRevealComplete: (roomId: string) => void;
  onGameOver: (roomId: string) => void;
  getActivePlayerIds?: () => string[];
  getPlayerSummaries?: () => Array<{ playerId: string; pseudo: string; isHost: boolean; isAfk: boolean }>;
  randomIndexProvider?: (length: number) => number;
  bridge?: BridgeLike;
};

type SessionPhase =
  | "table_order"
  | "revealing"
  | "proposing"
  | "voting"
  | "confidence_result"
  | "mission"
  | "mission_result"
  | "end_game";

type MissionResultPayload = {
  votes: MissionVote[];
  winner: Faction;
  naziVoteCount?: number;
};

type ConfidenceResultPayload = {
  votes: Record<string, ConfidenceVote>;
  approved: boolean;
};

type RoundSummary = {
  missionNumber: number;
  chefId: string;
  requiredTeamSize: number;
};

export class GameSession {
  private readonly roomId: string;
  private readonly playerIds: string[];
  private readonly socketByPlayer: Map<string, string>;
  private readonly io: Server;
  private readonly bridge: BridgeLike;
  private readonly ruleset: ResolvedRuleset;
  private readonly hostPlayerId: string;
  private readonly persistCursor: PersistCursor;
  private readonly onRevealComplete: (roomId: string) => void;
  private readonly onGameOver: (roomId: string) => void;
  private readonly getActivePlayerIds: () => string[];
  private readonly getPlayerSummaries: () => Array<{ playerId: string; pseudo: string; isHost: boolean; isAfk: boolean }>;
  private readonly randomIndexProvider: (length: number) => number;

  private phase: SessionPhase = "table_order";
  private missionNumber = 1;
  private chefCursor: number;
  private turnOrder: string[];
  private proposedTeam: string[] = [];
  private confidenceVotes = new Map<string, ConfidenceVote>();
  private missionVotes = new Map<string, MissionVote>();
  private tableOrder: string[] = [];
  private tableOrderConfirmed = new Set<string>();
  private revealedPlayers = new Set<string>();
  private confidenceResultConfirmed = new Set<string>();
  private missionResultConfirmed = new Set<string>();
  private endGameConfirmed = new Set<string>();

  private lastConfidenceResult: ConfidenceResultPayload | null = null;
  private currentRound: RoundSummary | null = null;
  private naziWins = 0;
  private communistWins = 0;
  private roleMap: RoleMap = {};
  private gameWinner: Faction | null = null;
  private lastMissionWinner: Faction | null = null;
  private lastMissionNaziVoteCount: number | null = null;
  private engineStarted = false;

  public constructor(
    roomId: string,
    playerIds: string[],
    chefCursor: number,
    socketByPlayer: Map<string, string>,
    io: Server,
    config: SessionConfig,
  ) {
    this.roomId = roomId;
    this.playerIds = [...playerIds];
    this.chefCursor = chefCursor;
    this.socketByPlayer = socketByPlayer;
    this.io = io;
    this.bridge = config.bridge ?? new PythonBridge(config.pythonPath, config.enginePath);
    this.ruleset = config.ruleset;
    this.hostPlayerId = config.hostPlayerId;
    this.persistCursor = config.persistCursor;
    this.onRevealComplete = config.onRevealComplete;
    this.onGameOver = config.onGameOver;
    this.turnOrder = [...playerIds];
    this.randomIndexProvider =
      config.randomIndexProvider ??
      ((length) => {
        if (length <= 1) {
          return 0;
        }
        return Math.floor(Math.random() * length);
      });
    this.getActivePlayerIds = config.getActivePlayerIds ?? (() => [...this.playerIds]);
    this.getPlayerSummaries =
      config.getPlayerSummaries ??
      (() =>
        this.playerIds.map((playerId, index) => ({
          playerId,
          pseudo: playerId,
          isHost: index === 0,
          isAfk: !this.getActivePlayerIds().includes(playerId),
        })));
  }

  public async start(): Promise<void> {
    this.phase = "table_order";
    this.missionNumber = 1;
    this.turnOrder = [...this.playerIds];
    this.tableOrder = [];
    this.tableOrderConfirmed.clear();
    this.revealedPlayers.clear();
    this.confidenceVotes.clear();
    this.missionVotes.clear();
    this.confidenceResultConfirmed.clear();
    this.missionResultConfirmed.clear();
    this.endGameConfirmed.clear();
    this.currentRound = null;
    this.lastConfidenceResult = null;
    this.proposedTeam = [];
    this.gameWinner = null;
    this.lastMissionWinner = null;
    this.naziWins = 0;
    this.communistWins = 0;
    this.roleMap = {};
    this.lastMissionNaziVoteCount = null;
    this.engineStarted = false;

    for (const playerId of this.playerIds) {
      const socketId = this.socketByPlayer.get(playerId);
      if (socketId !== undefined) {
        this.io.to(socketId).emit(SERVER_EVENTS.GAME_STARTED);
      }
    }

    this.emitTableOrderUpdate();
  }

  public updatePlayerSocket(playerId: string, socketId: string): void {
    if (this.playerIds.includes(playerId)) {
      this.socketByPlayer.set(playerId, socketId);
    }
  }

  public async syncPlayer(playerId: string): Promise<void> {
    this.ensureKnownPlayer(playerId);

    const socketId = this.socketByPlayer.get(playerId);
    if (socketId === undefined) {
      return;
    }

    if (!this.engineStarted) {
      this.io.to(socketId).emit(SERVER_EVENTS.RESYNC, this.buildResyncPayload(playerId));
      return;
    }

    const viewRaw = await this.bridge.send("get_player_view", { player_id: playerId });
    const playerView = this.normalizePlayerView(viewRaw);

    this.io.to(socketId).emit(SERVER_EVENTS.RESYNC, this.buildResyncPayload(playerId, playerView));
    this.io.to(socketId).emit(SERVER_EVENTS.ROLE_ASSIGNED, {
      playerId,
      role: playerView[playerId],
      roleMap: playerView[playerId] === "nazi" ? playerView : undefined,
    });

    if (this.phase === "mission" && this.proposedTeam.length > 0) {
      this.io.to(socketId).emit(SERVER_EVENTS.MISSION_PHASE, {
        team: [...this.proposedTeam],
        votesSubmitted: this.missionVotes.size,
        votesRequired: this.getActivePlayerIds().filter((id) => this.proposedTeam.includes(id)).length,
        submittedPlayerIds: [...this.missionVotes.keys()],
      });
    }
  }

  public async handleTableOrderTap(playerId: string): Promise<void> {
    this.ensureKnownPlayer(playerId);
    if (this.phase !== "table_order") {
      return;
    }

    if (!this.getActivePlayerIds().includes(playerId)) {
      return;
    }

    if (this.tableOrder.includes(playerId)) {
      return;
    }

    this.tableOrder.push(playerId);
    this.tableOrderConfirmed.delete(playerId);
    this.emitTableOrderUpdate();
  }

  public async handleTableOrderAdjust(playerId: string, position: number): Promise<void> {
    this.ensureKnownPlayer(playerId);
    if (this.phase !== "table_order") {
      return;
    }

    const currentIndex = this.tableOrder.indexOf(playerId);
    if (currentIndex === -1) {
      return;
    }

    this.tableOrder.splice(currentIndex, 1);
    const normalizedPosition = Number.isFinite(position) ? Math.max(1, Math.floor(position)) : 1;
    const insertionIndex = Math.min(this.tableOrder.length, normalizedPosition - 1);
    this.tableOrder.splice(insertionIndex, 0, playerId);
    this.tableOrderConfirmed.delete(playerId);
    this.emitTableOrderUpdate();
  }

  public async confirmTableOrder(playerId: string): Promise<void> {
    this.ensureKnownPlayer(playerId);
    if (this.phase !== "table_order") {
      return;
    }

    const activePlayers = this.getActivePlayerIds();
    if (this.tableOrder.length < activePlayers.length) {
      return;
    }

    this.tableOrderConfirmed.add(playerId);
    this.emitTableOrderUpdate();

    if (this.tableOrderConfirmed.size < activePlayers.length) {
      return;
    }

    const fullTurnOrder = [
      ...this.tableOrder,
      ...this.playerIds.filter((id) => !this.tableOrder.includes(id)),
    ];
    this.turnOrder = this.rotateTurnOrder(fullTurnOrder);
    this.chefCursor = 0;

    await this.bridge.send("start_game", {
      player_ids: this.turnOrder,
      chef_cursor: this.chefCursor,
      ...this.ruleset.engineArgs,
    });
    this.engineStarted = true;

    for (const orderedPlayerId of this.turnOrder) {
      const viewRaw = await this.bridge.send("get_player_view", { player_id: orderedPlayerId });
      const playerView = this.normalizePlayerView(viewRaw);
      this.roleMap[orderedPlayerId] = playerView[orderedPlayerId];

      const socketId = this.socketByPlayer.get(orderedPlayerId);
      if (socketId !== undefined) {
        this.io.to(socketId).emit(SERVER_EVENTS.ROLE_ASSIGNED, {
          playerId: orderedPlayerId,
          role: playerView[orderedPlayerId],
          roleMap: playerView[orderedPlayerId] === "nazi" ? playerView : undefined,
        });
      }
    }

    this.phase = "revealing";
    this.revealedPlayers.clear();
  }

  public async resetTableOrder(playerId: string): Promise<void> {
    this.ensureKnownPlayer(playerId);
    if (this.phase !== "table_order") {
      return;
    }

    if (playerId !== this.hostPlayerId) {
      throw new Error("only host can reset table order");
    }

    this.tableOrder = [];
    this.tableOrderConfirmed.clear();
    this.emitTableOrderUpdate();
  }

  public async confirmRoleReveal(playerId: string): Promise<void> {
    this.ensureKnownPlayer(playerId);
    if (this.phase !== "revealing") {
      return;
    }

    this.revealedPlayers.add(playerId);
    if (this.revealedPlayers.size < this.getActivePlayerIds().length) {
      return;
    }

    this.onRevealComplete(this.roomId);
    await this.pause(150);
    this.phase = "proposing";
    this.emitRoundStarted();
  }

  public async handleProposeTeam(playerId: string, team: string[]): Promise<void> {
    this.ensureKnownPlayer(playerId);
    this.ensurePhase("proposing");
    this.ensureCurrentChef(playerId);

    const expectedSize = this.ruleset.missionSizes[this.missionNumber - 1];
    if (expectedSize === undefined || expectedSize <= 0) {
      throw new Error(`mission size for mission ${this.missionNumber} is invalid`);
    }

    if (team.length !== expectedSize) {
      throw new Error("invalid team size for this mission");
    }

    if (new Set(team).size !== team.length) {
      throw new Error("team contains duplicate player ids");
    }

    if (team.some((member) => !this.playerIds.includes(member))) {
      throw new Error("team contains invalid player ids");
    }

    const activePlayers = new Set(this.getActivePlayerIds());
    if (team.some((member) => !activePlayers.has(member))) {
      throw new Error("team contains inactive player ids");
    }

    await this.bridge.send("propose_team", { team });

    this.proposedTeam = [...team];
    this.confidenceVotes.clear();
    this.missionVotes.clear();
    this.confidenceResultConfirmed.clear();
    this.phase = "voting";

    this.io.to(this.roomId).emit(SERVER_EVENTS.PROPOSAL_PHASE, {
      chef: playerId,
      missionSize: expectedSize,
      missionIndex: this.missionNumber,
      team: [...team],
    });

    this.io.to(this.roomId).emit(SERVER_EVENTS.CONFIDENCE_PHASE);
  }

  public async handleConfidenceVote(playerId: string, vote: ConfidenceVote): Promise<void> {
    this.ensureKnownPlayer(playerId);
    if (this.phase !== "voting") {
      return;
    }

    if (this.confidenceVotes.has(playerId)) {
      throw new Error("player already submitted a confidence vote");
    }

    this.confidenceVotes.set(playerId, vote);
    if (this.confidenceVotes.size < this.getActivePlayerIds().length) {
      return;
    }

    const votesObject: Record<string, ConfidenceVote> = {};
    const activePlayers = new Set(this.getActivePlayerIds());
    for (const id of this.playerIds) {
      if (!activePlayers.has(id)) {
        votesObject[id] = "no";
        continue;
      }

      const submittedVote = this.confidenceVotes.get(id);
      if (submittedVote === undefined) {
        throw new Error("missing confidence vote from active player");
      }
      votesObject[id] = submittedVote;
    }

    const roundStateRaw = await this.bridge.send("submit_confidence_votes", {
      votes: Object.fromEntries(
        Object.entries(votesObject).map(([id, submittedVote]) => [id, submittedVote.toUpperCase()]),
      ),
    });
    const roundState = this.normalizeRoundState(roundStateRaw);
    const approved = this.phaseFromEngine(roundState.phase) === "mission";

    this.lastConfidenceResult = {
      votes: votesObject,
      approved,
    };

    this.phase = "confidence_result";
    this.confidenceVotes.clear();
    this.confidenceResultConfirmed.clear();

    this.io.to(this.roomId).emit(SERVER_EVENTS.CONFIDENCE_REVEALED, {
      votes: Object.entries(votesObject).map(([id, submittedVote]) => ({
        playerId: id,
        vote: submittedVote,
      })),
      result: approved ? "yes" : "no",
      approved,
    });
  }

  public async confirmConfidenceResult(playerId: string): Promise<void> {
    this.ensureKnownPlayer(playerId);
    if (this.phase !== "confidence_result") {
      return;
    }

    this.confidenceResultConfirmed.add(playerId);
    if (this.confidenceResultConfirmed.size < this.getActivePlayerIds().length) {
      return;
    }

    this.confidenceResultConfirmed.clear();
    const approved = this.lastConfidenceResult?.approved ?? false;

    if (!approved) {
      this.phase = "proposing";
      this.proposedTeam = [];
      this.missionVotes.clear();
      this.emitRoundStarted();
      return;
    }

    this.phase = "mission";
    this.missionVotes.clear();
    this.io.to(this.roomId).emit(SERVER_EVENTS.MISSION_PHASE, {
      team: [...this.proposedTeam],
      votesSubmitted: this.missionVotes.size,
      votesRequired: this.getActivePlayerIds().filter((id) => this.proposedTeam.includes(id)).length,
      submittedPlayerIds: [...this.missionVotes.keys()],
    });
    this.emitMissionProgress(this.getActivePlayerIds().filter((id) => this.proposedTeam.includes(id)).length);
  }

  public async handleMissionVote(playerId: string, vote: MissionVote): Promise<void> {
    this.ensureKnownPlayer(playerId);
    this.ensurePhase("mission");

    if (!this.proposedTeam.includes(playerId)) {
      return;
    }

    const playerFaction = this.roleMap[playerId];
    if (playerFaction === undefined) {
      return;
    }

    if (playerFaction === "communist" && vote === "nazi") {
      return;
    }

    if (this.missionVotes.has(playerId)) {
      return;
    }

    this.missionVotes.set(playerId, vote);

    const activeTeamMembers = this.getActivePlayerIds().filter((id) => this.proposedTeam.includes(id));
    this.emitMissionProgress(activeTeamMembers.length);
    if (this.missionVotes.size < activeTeamMembers.length) {
      return;
    }

    const votesObject: Record<string, string> = {};
    for (const member of activeTeamMembers) {
      const memberVote = this.missionVotes.get(member);
      if (memberVote === undefined) {
        throw new Error("all active team members must vote on mission");
      }
      votesObject[member] = memberVote.toUpperCase();
    }

    const missionResultRaw = await this.bridge.send("submit_mission_votes", { votes: votesObject });
    const missionResult = this.normalizeMissionResult(missionResultRaw);

    if (missionResult.winner === "nazi") {
      this.naziWins += 1;
    } else {
      this.communistWins += 1;
    }
    this.lastMissionWinner = missionResult.winner;
    this.lastMissionNaziVoteCount = missionResult.naziVoteCount ?? missionResult.votes.filter((entry) => entry === "nazi").length;

    this.phase = "mission_result";
    this.missionResultConfirmed.clear();
    this.missionVotes.clear();

    this.io.to(this.roomId).emit(SERVER_EVENTS.MISSION_REVEALED, {
      team: [...this.proposedTeam],
      naziVotes: this.lastMissionNaziVoteCount,
      result: missionResult.winner,
      scores: {
        nazi: this.naziWins,
        communist: this.communistWins,
      },
    });
  }

  public async confirmMissionResult(playerId: string): Promise<void> {
    this.ensureKnownPlayer(playerId);
    if (this.phase !== "mission_result") {
      return;
    }

    this.missionResultConfirmed.add(playerId);
    if (this.missionResultConfirmed.size < this.getActivePlayerIds().length) {
      return;
    }

    this.missionResultConfirmed.clear();

    if (this.lastMissionWinner === null) {
      throw new Error("missing mission winner before confirmation");
    }
    await this.bridge.send("record_mission_result", { winner: this.lastMissionWinner.toUpperCase() });
    const gameWinnerRaw = await this.bridge.send("check_win_condition", {});
    const gameWinner = this.normalizeOptionalFaction(gameWinnerRaw);
    this.lastMissionWinner = null;

    if (gameWinner !== undefined) {
      this.gameWinner = gameWinner;
      this.phase = "end_game";
      this.endGameConfirmed.clear();
      this.io.to(this.roomId).emit(SERVER_EVENTS.GAME_OVER, { winner: gameWinner });
      return;
    }

    this.missionNumber += 1;
    this.proposedTeam = [];
    this.phase = "proposing";
    await this.syncChefCursorFromEngine();
    this.emitRoundStarted();
  }

  public async confirmEndGame(playerId: string): Promise<void> {
    this.ensureKnownPlayer(playerId);
    if (this.phase !== "end_game") {
      return;
    }

    this.endGameConfirmed.add(playerId);
    if (this.endGameConfirmed.size < this.getActivePlayerIds().length) {
      return;
    }

    await this.finishGame();
  }

  public async handleAfkForfeit(playerId: string): Promise<void> {
    if (this.gameWinner !== null) {
      return;
    }

    const faction = this.roleMap[playerId];
    if (faction !== "nazi" && faction !== "communist") {
      return;
    }

    const winner: Faction = faction === "nazi" ? "communist" : "nazi";
    this.gameWinner = winner;
    this.phase = "end_game";
    this.io.to(this.roomId).emit(SERVER_EVENTS.GAME_OVER, { winner });
    await this.finishGame();
  }

  public async handleRosterChange(): Promise<void> {
    if (this.phase === "table_order") {
      this.emitTableOrderUpdate();
      return;
    }

    if (this.phase === "revealing" && this.revealedPlayers.size >= this.getActivePlayerIds().length) {
      this.onRevealComplete(this.roomId);
      this.phase = "proposing";
      this.emitRoundStarted();
      return;
    }

    if (this.phase === "voting" && this.confidenceVotes.size >= this.getActivePlayerIds().length) {
      await this.handleConfidenceVoteCompletion();
      return;
    }

    if (this.phase === "confidence_result" && this.confidenceResultConfirmed.size >= this.getActivePlayerIds().length) {
      const activePlayers = [...this.getActivePlayerIds()];
      if (activePlayers.length === 0) {
        return;
      }
      for (const id of activePlayers) {
        this.confidenceResultConfirmed.add(id);
      }
      await this.confirmConfidenceResult(activePlayers[0]);
      return;
    }

    if (
      this.phase === "mission" &&
      this.missionVotes.size >= this.getActivePlayerIds().filter((id) => this.proposedTeam.includes(id)).length
    ) {
      await this.handleMissionVoteCompletion();
      return;
    }

    if (this.phase === "mission_result" && this.missionResultConfirmed.size >= this.getActivePlayerIds().length) {
      const activePlayers = [...this.getActivePlayerIds()];
      if (activePlayers.length === 0) {
        return;
      }
      for (const id of activePlayers) {
        this.missionResultConfirmed.add(id);
      }
      await this.confirmMissionResult(activePlayers[0]);
      return;
    }

    if (this.phase === "end_game" && this.endGameConfirmed.size >= this.getActivePlayerIds().length) {
      await this.finishGame();
    }
  }

  public dispose(): void {
    if (typeof this.bridge.dispose === "function") {
      this.bridge.dispose();
      return;
    }

    if (typeof this.bridge.kill === "function") {
      this.bridge.kill();
    }
  }

  private emitTableOrderUpdate(): void {
    const activePlayerIds = this.getActivePlayerIds();
    this.io.to(this.roomId).emit(SERVER_EVENTS.TABLE_ORDER_UPDATED, {
      taps: this.tableOrder.length,
      playerCount: activePlayerIds.length,
      completed: this.tableOrder.length >= activePlayerIds.length,
      order: [...this.tableOrder],
      confirmed: [...this.tableOrderConfirmed],
    });
  }

  private emitRoundStarted(): void {
    const chefId = this.turnOrder[this.chefCursor];
    if (chefId === undefined) {
      throw new Error("invalid chef cursor for current turn order");
    }
    const requiredSize = this.ruleset.missionSizes[this.missionNumber - 1];
    if (requiredSize === undefined || requiredSize <= 0) {
      throw new Error(`mission size for mission ${this.missionNumber} is invalid`);
    }

    this.currentRound = {
      missionNumber: this.missionNumber,
      chefId,
      requiredTeamSize: requiredSize,
    };

    this.io.to(this.roomId).emit(SERVER_EVENTS.PROPOSAL_PHASE, {
      chef: this.currentRound.chefId,
      missionSize: this.currentRound.requiredTeamSize,
      missionIndex: this.currentRound.missionNumber,
      team: [],
    });
  }

  private emitMissionProgress(votesRequired: number): void {
    this.io.to(this.roomId).emit(SERVER_EVENTS.MISSION_PROGRESS, {
      team: [...this.proposedTeam],
      votesSubmitted: this.missionVotes.size,
      votesRequired,
      submittedPlayerIds: [...this.missionVotes.keys()],
    });
  }

  private async finishGame(): Promise<void> {
    const cursorRaw = await this.bridge.send("end_game", {});
    const persistedCursor = this.normalizeCursor(cursorRaw);
    this.persistCursor(this.roomId, persistedCursor);

    this.io.to(this.roomId).emit(SERVER_EVENTS.ROLES_REVEALED, {
      roleMap: this.roleMap,
    });

    this.phase = "proposing";
    this.dispose();
    this.onGameOver(this.roomId);
  }

  private async syncChefCursorFromEngine(): Promise<void> {
    const gameStateRaw = await this.bridge.send("get_game_state", {});
    const gameState = gameStateRaw as { chef_cursor?: number };
    if (typeof gameState.chef_cursor === "number") {
      this.chefCursor = gameState.chef_cursor;
    }
  }

  private ensureCurrentChef(playerId: string): void {
    const expectedChef = this.turnOrder[this.chefCursor];
    if (playerId !== expectedChef) {
      throw new Error("only the current chef can propose a team");
    }
  }

  private ensureKnownPlayer(playerId: string): void {
    if (!this.playerIds.includes(playerId)) {
      throw new Error("unknown player id for this session");
    }
  }

  private ensurePhase(expected: SessionPhase): void {
    if (this.phase !== expected) {
      throw new Error(`invalid phase: expected ${expected}, got ${this.phase}`);
    }
  }

  private normalizePlayerView(raw: unknown): PlayerView {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("invalid player view from engine");
    }

    const normalized: PlayerView = {};
    for (const [playerId, faction] of Object.entries(raw as Record<string, unknown>)) {
      normalized[playerId] = this.normalizeFaction(faction);
    }
    return normalized;
  }

  private normalizeFaction(raw: unknown): Faction {
    if (typeof raw !== "string") {
      throw new Error("invalid faction value from engine");
    }
    const normalized = raw.toLowerCase();
    if (normalized === "nazi" || normalized === "communist") {
      return normalized;
    }
    throw new Error(`unexpected faction value: ${raw}`);
  }

  private normalizeOptionalFaction(raw: unknown): Faction | undefined {
    if (raw === null || raw === undefined) {
      return undefined;
    }
    return this.normalizeFaction(raw);
  }

  private normalizeRoundState(raw: unknown): RoundStateLike {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("invalid round state from engine");
    }

    const payload = raw as Record<string, unknown>;
    if (
      typeof payload.phase !== "string" ||
      typeof payload.chef_id !== "string" ||
      !Array.isArray(payload.proposed_team) ||
      typeof payload.confidence_votes !== "object" ||
      payload.confidence_votes === null ||
      !Array.isArray(payload.mission_votes)
    ) {
      throw new Error("invalid round state from engine: missing or malformed fields");
    }

    return {
      phase: payload.phase,
      chef_id: payload.chef_id,
      proposed_team: payload.proposed_team as string[],
      confidence_votes: payload.confidence_votes as Record<string, string>,
      mission_votes: payload.mission_votes as string[],
    };
  }

  private phaseFromEngine(raw: string): "proposing" | "voting" | "mission" {
    const normalized = raw.toLowerCase();
    if (normalized === "proposing" || normalized === "voting" || normalized === "mission") {
      return normalized;
    }
    throw new Error(`unexpected round phase from engine: ${raw}`);
  }

  private normalizeMissionVotes(rawVotes: unknown): MissionVote[] {
    if (!Array.isArray(rawVotes)) {
      throw new Error("invalid mission vote list from engine");
    }

    return rawVotes.map((vote) => {
      if (typeof vote !== "string") {
        throw new Error("invalid mission vote value from engine");
      }
      const normalized = vote.toLowerCase();
      if (normalized === "nazi" || normalized === "communist") {
        return normalized;
      }
      throw new Error(`unexpected mission vote value: ${vote}`);
    });
  }

  private normalizeMissionResult(raw: unknown): MissionResultPayload {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("invalid mission result from engine");
    }

    const payload = raw as Record<string, unknown>;
    if (!("winner" in payload) || !("votes" in payload)) {
      throw new Error("invalid mission result from engine: missing fields");
    }

    const winner = this.normalizeFaction(payload.winner);
    const votes = this.normalizeMissionVotes(payload.votes);
    const naziVoteCount = typeof payload.nazi_vote_count === "number" ? payload.nazi_vote_count : undefined;
    return { votes, winner, naziVoteCount };
  }

  private buildResyncPayload(playerId: string, playerView?: PlayerView): ResyncPayload {
    const phase = this.mapSessionPhaseToFlowPhase();

    return {
      room: {
        players: this.getPlayerSummaries(),
        code: this.roomId,
      },
      phase,
      missionCount: this.ruleset.missionCount,
      tableOrder: [...this.tableOrder],
      tableOrderConfirmed: [...this.tableOrderConfirmed],
      role:
        playerView === undefined
          ? null
          : {
              role: playerView[playerId],
              roleMap: playerView[playerId] === "nazi" ? playerView : undefined,
            },
      proposal:
        this.currentRound === null
          ? null
          : {
              chef: this.currentRound.chefId,
              missionSize: this.currentRound.requiredTeamSize,
              missionIndex: this.currentRound.missionNumber,
            },
      confidence:
        this.lastConfidenceResult === null
          ? null
          : {
              votes: Object.entries(this.lastConfidenceResult.votes).map(([votePlayerId, vote]) => ({
                playerId: votePlayerId,
                vote,
              })),
              result: this.lastConfidenceResult.approved ? "yes" : "no",
            },
      mission:
        this.phase === "mission_result"
          ? {
              team: [...this.proposedTeam],
              naziVotes: this.lastMissionNaziVoteCount ?? 0,
              result: this.naziWins > this.communistWins ? "nazi" : "communist",
              scores: {
                nazi: this.naziWins,
                communist: this.communistWins,
              },
            }
          : null,
      missionProgress:
        this.phase === "mission" && this.proposedTeam.length > 0
          ? {
              team: [...this.proposedTeam],
              votesSubmitted: this.missionVotes.size,
              votesRequired: this.getActivePlayerIds().filter((id) => this.proposedTeam.includes(id)).length,
              submittedPlayerIds: [...this.missionVotes.keys()],
            }
          : null,
      gameOver: this.gameWinner === null ? null : { winner: this.gameWinner },
    };
  }

  private mapSessionPhaseToFlowPhase(): FlowPhase {
    if (this.phase === "table_order") {
      return "table_order";
    }
    if (this.phase === "revealing") {
      return "role_reveal";
    }
    if (this.phase === "proposing") {
      return "proposing";
    }
    if (this.phase === "voting") {
      return "confidence_vote";
    }
    if (this.phase === "confidence_result") {
      return "confidence_result";
    }
    if (this.phase === "mission") {
      return "mission_vote";
    }
    if (this.phase === "mission_result") {
      return "mission_result";
    }
    return "end_game";
  }

  private async handleConfidenceVoteCompletion(): Promise<void> {
    if (this.phase !== "voting") {
      return;
    }

    const activePlayers = this.getActivePlayerIds();
    const votesObject: Record<string, ConfidenceVote> = {};
    const activePlayersSet = new Set(activePlayers);

    for (const playerId of this.playerIds) {
      if (!activePlayersSet.has(playerId)) {
        votesObject[playerId] = "no";
        continue;
      }

      const vote = this.confidenceVotes.get(playerId);
      if (vote === undefined) {
        return;
      }
      votesObject[playerId] = vote;
    }

    const roundStateRaw = await this.bridge.send("submit_confidence_votes", {
      votes: Object.fromEntries(
        Object.entries(votesObject).map(([id, submittedVote]) => [id, submittedVote.toUpperCase()]),
      ),
    });
    const roundState = this.normalizeRoundState(roundStateRaw);
    const approved = this.phaseFromEngine(roundState.phase) === "mission";

    this.lastConfidenceResult = {
      votes: votesObject,
      approved,
    };

    this.phase = "confidence_result";
    this.confidenceVotes.clear();
    this.confidenceResultConfirmed.clear();

    this.io.to(this.roomId).emit(SERVER_EVENTS.CONFIDENCE_REVEALED, {
      votes: Object.entries(votesObject).map(([id, submittedVote]) => ({
        playerId: id,
        vote: submittedVote,
      })),
      result: approved ? "yes" : "no",
      approved,
    });
  }

  private async handleMissionVoteCompletion(): Promise<void> {
    if (this.phase !== "mission") {
      return;
    }

    const activeTeamMembers = this.getActivePlayerIds().filter((id) => this.proposedTeam.includes(id));
    if (activeTeamMembers.length === 0) {
      return;
    }

    const votesObject: Record<string, string> = {};
    for (const member of activeTeamMembers) {
      const memberVote = this.missionVotes.get(member);
      if (memberVote === undefined) {
        return;
      }
      votesObject[member] = memberVote.toUpperCase();
    }

    const missionResultRaw = await this.bridge.send("submit_mission_votes", { votes: votesObject });
    const missionResult = this.normalizeMissionResult(missionResultRaw);

    if (missionResult.winner === "nazi") {
      this.naziWins += 1;
    } else {
      this.communistWins += 1;
    }
    this.lastMissionWinner = missionResult.winner;

    this.phase = "mission_result";
    this.missionResultConfirmed.clear();
    this.missionVotes.clear();

    this.io.to(this.roomId).emit(SERVER_EVENTS.MISSION_REVEALED, {
      naziVotes: missionResult.naziVoteCount ?? missionResult.votes.filter((entry) => entry === "nazi").length,
      result: missionResult.winner,
      scores: {
        nazi: this.naziWins,
        communist: this.communistWins,
      },
    });
  }

  private normalizeCursor(raw: unknown): number {
    if (typeof raw !== "number" || Number.isNaN(raw) || !Number.isInteger(raw)) {
      return this.chefCursor;
    }
    return raw;
  }

  private async pause(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  private rotateTurnOrder(order: string[]): string[] {
    if (order.length <= 1) {
      return [...order];
    }

    const requestedIndex = this.randomIndexProvider(order.length);
    const normalizedIndex = Number.isInteger(requestedIndex)
      ? Math.max(0, Math.min(order.length - 1, requestedIndex))
      : 0;

    if (normalizedIndex === 0) {
      return [...order];
    }

    return [...order.slice(normalizedIndex), ...order.slice(0, normalizedIndex)];
  }
}
