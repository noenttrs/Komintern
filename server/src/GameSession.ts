import type { Server } from "socket.io";

import { SERVER_EVENTS } from "./events";
import { log } from "./logger";
import { PythonBridge } from "./PythonBridge";
import type { ResolvedRuleset } from "./rulesets";
import type {
  ConfidenceHistoryEntry,
  ConfidenceVote,
  ConfidenceVoteRecord,
  Faction,
  FlowPhase,
  MissionHistoryEntry,
  MissionVote,
  PlayerView,
  ResyncPayload,
  RoleMap,
  RoomUpdatedPayload,
  Scores,
} from "./types";

export type BridgeLike = {
  send(command: string, args: Record<string, unknown>): Promise<unknown>;
  dispose(): void;
};

export type SessionConfig = {
  ruleset: ResolvedRuleset;
  /** Joueurs non AFK de la room (ils peuvent être momentanément déconnectés). */
  getActivePlayerIds: () => string[];
  getRoomPayload: () => RoomUpdatedPayload;
  getHostPlayerId: () => string | null;
  /** Chef désigné par la partie précédente (rotation continue), s'il est encore là. */
  nextChefId?: string | null;
  onRevealComplete: () => void;
  /** Vainqueur connu (missions ou abandon) : la partie peut être enregistrée tout de suite. */
  onGameDecided?: (summary: GameSummary) => void;
  onGameFinished: (nextChefId: string | null, summary: GameSummary) => void;
  onAborted: (reason: string, summary: GameSummary) => void;
  randomIndexProvider?: (length: number) => number;
  /** Injecté par les tests ; sinon un vrai process Python est lancé. */
  bridge?: BridgeLike;
  pythonPath?: string;
  enginePath?: string;
  engineTimeoutMs?: number;
  /** Pause laissée aux clients pour leur animation de révélation. */
  revealPauseMs?: number;
  /** Des joueurs doivent agir (proposer, voter, jouer la mission) : notifications. */
  onTurn?: (playerIds: string[], kind: TurnKind) => void;
};

export type TurnKind = "proposal" | "vote" | "mission";

type SessionPhase =
  | "table_order"
  | "revealing"
  | "proposing"
  | "voting"
  | "confidence_result"
  | "mission"
  | "mission_result"
  | "end_game"
  | "finished";

type RoundInfo = {
  missionIndex: number;
  chefId: string;
  requiredTeamSize: number;
};

type MissionOutcome = MissionHistoryEntry & { scores: Scores; gameWinner: Faction | null; nextRound: RoundInfo | null };

type GameOverInfo = { winner: Faction; reason: "missions" | "forfeit"; forfeitedBy?: string };

/** Ce que la partie laisse derrière elle : log de partie et statistiques des comptes. */
/** Duel à 2 : gagnants (0, 1 ou 2), raison et votes. */
export type DuelSummary = { winners: string[]; reason: string; votes: Record<string, DuelVote>; forfeitedBy?: string };

export type DuelVote = "trust" | "accuse";

export type GameSummary = {
  duel?: DuelSummary | null;
  turnOrder: string[];
  roleMap: RoleMap;
  confidenceHistory: ConfidenceHistoryEntry[];
  missionHistory: MissionHistoryEntry[];
  scores: Scores;
  gameOver: GameOverInfo | null;
};

/**
 * Déroulé d'une partie pour une room. Toute action publique passe par une file
 * sérialisée : aucune action ne peut s'intercaler entre les `await` d'une autre
 * (double confirmation, vote pendant l'appel moteur, etc.).
 */
export class GameSession {
  private readonly roomId: string;
  private readonly playerIds: string[];
  private readonly socketByPlayer: Map<string, string>;
  private readonly io: Server;
  private readonly bridge: BridgeLike;
  private readonly config: SessionConfig;
  private readonly randomIndexProvider: (length: number) => number;

  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  private phase: SessionPhase = "table_order";
  private engineStarted = false;
  private tableOrder: string[] = [];
  private turnOrder: string[] = [];
  private readonly tableOrderConfirmed = new Set<string>();
  private readonly revealedPlayers = new Set<string>();
  private readonly confidenceResultConfirmed = new Set<string>();
  private readonly missionResultConfirmed = new Set<string>();
  private readonly endGameConfirmed = new Set<string>();

  private round: RoundInfo | null = null;
  private proposedTeam: string[] = [];
  private readonly confidenceVotes = new Map<string, ConfidenceVote>();
  private readonly missionVotes = new Map<string, MissionVote>();
  private lastConfidence: { votes: ConfidenceVoteRecord[]; approved: boolean } | null = null;
  private lastMission: MissionOutcome | null = null;
  private readonly confidenceHistory: ConfidenceHistoryEntry[] = [];
  private readonly missionHistory: MissionHistoryEntry[] = [];
  private scores: Scores = { nazi: 0, communist: 0 };
  private roleMap: RoleMap = {};
  private readonly playerViews = new Map<string, PlayerView>();
  private gameOver: GameOverInfo | null = null;

  public constructor(
    roomId: string,
    playerIds: string[],
    socketByPlayer: Map<string, string>,
    io: Server,
    config: SessionConfig,
  ) {
    this.roomId = roomId;
    this.playerIds = [...playerIds];
    this.socketByPlayer = socketByPlayer;
    this.io = io;
    this.config = config;
    this.randomIndexProvider =
      config.randomIndexProvider ?? ((length) => (length <= 1 ? 0 : Math.floor(Math.random() * length)));
    this.bridge =
      config.bridge ??
      new PythonBridge(config.pythonPath ?? "python3", config.enginePath ?? "", {
        timeoutMs: config.engineTimeoutMs,
        onUnexpectedExit: (reason) => this.handleEngineFailure(reason),
      });
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public get currentPhase(): SessionPhase {
    return this.phase;
  }

  public hasPlayer(playerId: string): boolean {
    return this.playerIds.includes(playerId);
  }

  public summary(): GameSummary {
    return {
      turnOrder: [...this.turnOrder],
      roleMap: { ...this.roleMap },
      confidenceHistory: this.confidenceHistory.map((entry) => ({ ...entry, votes: [...entry.votes] })),
      missionHistory: this.missionHistory.map((entry) => ({ ...entry })),
      scores: { ...this.scores },
      gameOver: this.gameOver === null ? null : { ...this.gameOver },
    };
  }

  // ---------------------------------------------------------------- actions publiques

  public start(): Promise<void> {
    return this.serial(async () => {
      this.toRoom(SERVER_EVENTS.GAME_STARTED, {
        playerIds: [...this.playerIds],
        missionCount: this.config.ruleset.missionCount,
        missionSizes: [...this.config.ruleset.missionSizes],
      });
      this.emitTableOrderUpdate();
    });
  }

  public syncPlayer(playerId: string): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.toPlayer(playerId, SERVER_EVENTS.RESYNC, this.buildResyncPayload(playerId));
    });
  }

  public handleTableOrderTap(playerId: string): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.ensurePhase("table_order");
      if (!this.activeIds().includes(playerId) || this.tableOrder.includes(playerId)) {
        return;
      }
      this.tableOrder.push(playerId);
      this.tableOrderConfirmed.clear();
      this.emitTableOrderUpdate();
    });
  }

  public handleTableOrderAdjust(playerId: string, position: number): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.ensurePhase("table_order");
      const currentIndex = this.tableOrder.indexOf(playerId);
      if (currentIndex === -1) {
        throw new Error("tap the table first to take a seat");
      }
      this.tableOrder.splice(currentIndex, 1);
      const insertionIndex = Math.min(this.tableOrder.length, Math.max(1, Math.floor(position)) - 1);
      this.tableOrder.splice(insertionIndex, 0, playerId);
      this.tableOrderConfirmed.clear();
      this.emitTableOrderUpdate();
    });
  }

  public resetTableOrder(playerId: string): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.ensurePhase("table_order");
      if (playerId !== this.config.getHostPlayerId()) {
        throw new Error("only host can reset table order");
      }
      this.tableOrder = [];
      this.tableOrderConfirmed.clear();
      this.emitTableOrderUpdate();
    });
  }

  public confirmTableOrder(playerId: string): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.ensurePhase("table_order");
      if (!this.tableOrderComplete()) {
        throw new Error("every player must take a seat before confirming");
      }
      this.tableOrderConfirmed.add(playerId);
      this.emitTableOrderUpdate();
      await this.tryCompleteTableOrder();
    });
  }

  public confirmRoleReveal(playerId: string): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.ensurePhase("revealing");
      this.revealedPlayers.add(playerId);
      await this.tryCompleteReveal();
    });
  }

  public handleProposeTeam(playerId: string, team: string[]): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.ensurePhase("proposing");
      const round = this.requireRound();
      if (playerId !== round.chefId) {
        throw new Error("only the current chef can propose a team");
      }
      if (team.length !== round.requiredTeamSize) {
        throw new Error(`the team must have exactly ${round.requiredTeamSize} members`);
      }
      if (new Set(team).size !== team.length) {
        throw new Error("team contains duplicate player ids");
      }
      if (team.some((member) => !this.playerIds.includes(member))) {
        throw new Error("team contains invalid player ids");
      }
      const active = new Set(this.activeIds());
      if (team.some((member) => !active.has(member))) {
        throw new Error("team contains inactive players");
      }

      await this.engine("propose_team", { team, proposer_id: playerId });

      this.proposedTeam = [...team];
      this.confidenceVotes.clear();
      this.phase = "voting";
      this.toRoom(SERVER_EVENTS.PROPOSAL_PHASE, this.proposalPayload());
      this.toRoom(SERVER_EVENTS.CONFIDENCE_PHASE, { chef: round.chefId, team: [...team] });
    });
  }

  public handleConfidenceVote(playerId: string, vote: ConfidenceVote): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.ensurePhase("voting");
      if (!this.activeIds().includes(playerId)) {
        throw new Error("inactive players cannot vote");
      }
      if (this.confidenceVotes.has(playerId)) {
        throw new Error("player already submitted a confidence vote");
      }
      this.confidenceVotes.set(playerId, vote);
      await this.tryCompleteConfidence();
    });
  }

  public confirmConfidenceResult(playerId: string): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.ensurePhase("confidence_result");
      this.confidenceResultConfirmed.add(playerId);
      await this.tryCompleteConfidenceResult();
    });
  }

  public handleMissionVote(playerId: string, vote: MissionVote): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.ensurePhase("mission");
      if (!this.proposedTeam.includes(playerId)) {
        throw new Error("only team members can vote on the mission");
      }
      if (this.roleMap[playerId] === "communist" && vote === "nazi") {
        throw new Error("communist players cannot sabotage a mission");
      }
      if (this.missionVotes.has(playerId)) {
        throw new Error("player already submitted a mission vote");
      }
      this.missionVotes.set(playerId, vote);
      this.emitMissionProgress();
      await this.tryCompleteMission();
    });
  }

  public confirmMissionResult(playerId: string): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.ensurePhase("mission_result");
      this.missionResultConfirmed.add(playerId);
      await this.tryCompleteMissionResult();
    });
  }

  public confirmEndGame(playerId: string): Promise<void> {
    return this.serial(async () => {
      this.ensureKnownPlayer(playerId);
      this.ensurePhase("end_game");
      this.endGameConfirmed.add(playerId);
      await this.tryCompleteEndGame();
    });
  }

  /**
   * Un joueur est resté déconnecté trop longtemps. Une fois les rôles distribués, sa
   * faction perd la partie (docs/briefs/backend.md) ; avant, on l'exclut des quorums.
   */
  public handlePlayerAfk(playerId: string): Promise<void> {
    return this.serial(async () => {
      if (!this.playerIds.includes(playerId)) {
        return;
      }
      if (this.phase === "end_game" || this.phase === "finished") {
        await this.reevaluate();
        return;
      }
      const faction = this.roleMap[playerId];
      if (!this.engineStarted || faction === undefined) {
        // Parti avant la distribution des rôles : il resterait dans l'ordre des chefs et pourrait
        // bloquer la partie. On l'annule et la room revient au salon, sans lui.
        log.info("game aborted: player absent before roles", { roomId: this.roomId, playerId });
        this.toRoom(SERVER_EVENTS.GAME_ABORTED, { reason: "player_absent", playerId });
        this.dispose();
        this.config.onAborted("player_absent", this.summary());
        return;
      }

      try {
        await this.engine("forfeit", { faction: faction.toUpperCase() });
      } catch (error) {
        // Le forfait est décidé côté serveur ; le moteur n'est prévenu que pour cohérence.
        log.warn("engine forfeit failed", { roomId: this.roomId, error });
      }
      this.gameOver = { winner: faction === "nazi" ? "communist" : "nazi", reason: "forfeit", forfeitedBy: playerId };
      this.phase = "end_game";
      this.config.onGameDecided?.(this.summary());
      this.endGameConfirmed.clear();
      this.toRoom(SERVER_EVENTS.GAME_OVER, { ...this.gameOver, scores: this.scores });
      await this.tryCompleteEndGame();
    });
  }

  /** Un joueur est parti ou revenu : les quorums en attente sont peut-être atteints. */
  public handleRosterChange(): Promise<void> {
    return this.serial(async () => this.reevaluate());
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.bridge.dispose();
  }

  /** Mort inattendue du moteur : la partie est annulée, la room revient au salon. */
  public handleEngineFailure(reason: string): void {
    if (this.disposed) {
      return;
    }
    log.error("game aborted after engine failure", { roomId: this.roomId, reason });
    this.toRoom(SERVER_EVENTS.ERROR, {
      code: "engine_failure",
      message: "the game engine stopped unexpectedly; back to the lobby",
    });
    this.toRoom(SERVER_EVENTS.GAME_ABORTED, { reason: "engine_failure" });
    this.dispose();
    this.config.onAborted(reason, this.summary());
  }

  // ---------------------------------------------------------------- transitions

  private async reevaluate(): Promise<void> {
    switch (this.phase) {
      case "table_order":
        this.emitTableOrderUpdate();
        await this.tryCompleteTableOrder();
        return;
      case "revealing":
        await this.tryCompleteReveal();
        return;
      case "voting":
        await this.tryCompleteConfidence();
        return;
      case "confidence_result":
        await this.tryCompleteConfidenceResult();
        return;
      case "mission":
        this.emitMissionProgress();
        await this.tryCompleteMission();
        return;
      case "mission_result":
        await this.tryCompleteMissionResult();
        return;
      case "end_game":
        await this.tryCompleteEndGame();
        return;
      default:
        return;
    }
  }

  private async tryCompleteTableOrder(): Promise<void> {
    if (!this.tableOrderComplete() || !this.allActiveIn(this.tableOrderConfirmed)) {
      return;
    }

    const fullOrder = [...this.tableOrder, ...this.playerIds.filter((id) => !this.tableOrder.includes(id))];
    const previousChef = this.config.nextChefId;
    const chefCursor =
      previousChef !== undefined && previousChef !== null && fullOrder.includes(previousChef)
        ? fullOrder.indexOf(previousChef)
        : this.clampIndex(this.randomIndexProvider(fullOrder.length), fullOrder.length);

    try {
      const started = asRecord(
        await this.engine("start_game", { player_ids: fullOrder, chef_cursor: chefCursor, ...this.config.ruleset.engineArgs }),
        "start_game",
      );
      const round = parseRound(started.round);
      const views = new Map<string, PlayerView>();
      for (const playerId of fullOrder) {
        views.set(playerId, parsePlayerView(await this.engine("get_player_view", { player_id: playerId }), playerId));
      }

      this.engineStarted = true;
      this.turnOrder = fullOrder;
      this.round = round.info;
      this.scores = round.scores;
      this.roleMap = {};
      for (const [playerId, view] of views) {
        this.playerViews.set(playerId, view);
        this.roleMap[playerId] = view[playerId] as Faction;
      }
    } catch (error) {
      log.error("failed to start engine game", { roomId: this.roomId, error });
      this.tableOrderConfirmed.clear();
      this.toRoom(SERVER_EVENTS.ERROR, { code: "engine_start_failed", message: "could not start the game, please confirm again" });
      this.emitTableOrderUpdate();
      return;
    }

    this.phase = "revealing";
    this.revealedPlayers.clear();
    for (const playerId of this.turnOrder) {
      this.toPlayer(playerId, SERVER_EVENTS.ROLE_ASSIGNED, { playerId, ...(this.rolePayload(playerId) ?? {}), turnOrder: [...this.turnOrder] });
    }
  }

  private async tryCompleteReveal(): Promise<void> {
    if (!this.allActiveIn(this.revealedPlayers)) {
      return;
    }
    this.config.onRevealComplete();
    await this.pause(this.config.revealPauseMs ?? 150);
    if (this.disposed) {
      return;
    }
    this.phase = "proposing";
    this.emitRoundStarted();
  }

  private async tryCompleteConfidence(): Promise<void> {
    const voters = this.activeIds();
    if (voters.length === 0 || !voters.every((id) => this.confidenceVotes.has(id))) {
      return;
    }

    const votes: Record<string, ConfidenceVote> = {};
    for (const id of voters) {
      votes[id] = this.confidenceVotes.get(id) as ConfidenceVote;
    }

    let approved: boolean;
    try {
      const raw = asRecord(
        await this.engine("submit_confidence_votes", {
          votes: Object.fromEntries(Object.entries(votes).map(([id, vote]) => [id, vote.toUpperCase()])),
          voter_ids: voters,
        }),
        "submit_confidence_votes",
      );
      if (typeof raw.approved !== "boolean") {
        throw new Error("engine confidence result is missing `approved`");
      }
      approved = raw.approved;
    } catch (error) {
      log.error("confidence vote resolution failed", { roomId: this.roomId, error });
      this.confidenceVotes.clear();
      this.toRoom(SERVER_EVENTS.ERROR, { code: "vote_failed", message: "the vote could not be counted, please vote again" });
      this.toRoom(SERVER_EVENTS.CONFIDENCE_PHASE, { chef: this.round?.chefId, team: [...this.proposedTeam] });
      return;
    }

    const records = Object.entries(votes).map(([playerId, vote]) => ({ playerId, vote }));
    this.lastConfidence = { votes: records, approved };
    this.confidenceHistory.push({
      missionIndex: this.requireRound().missionIndex + 1,
      chef: this.requireRound().chefId,
      team: [...this.proposedTeam],
      votes: records,
      approved,
    });
    this.phase = "confidence_result";
    this.confidenceVotes.clear();
    this.confidenceResultConfirmed.clear();
    this.toRoom(SERVER_EVENTS.CONFIDENCE_REVEALED, { votes: records, result: approved ? "yes" : "no", approved });
  }

  private async tryCompleteConfidenceResult(): Promise<void> {
    if (!this.allActiveIn(this.confidenceResultConfirmed)) {
      return;
    }
    this.confidenceResultConfirmed.clear();

    if (this.lastConfidence?.approved !== true) {
      // Rejet (ou égalité) : même manche, même chef, nouvelle proposition.
      this.phase = "proposing";
      this.proposedTeam = [];
      this.emitRoundStarted();
      return;
    }

    this.phase = "mission";
    this.missionVotes.clear();
    this.toRoom(SERVER_EVENTS.MISSION_PHASE, this.missionProgressPayload());
    this.emitMissionProgress();
  }

  private async tryCompleteMission(): Promise<void> {
    const voters = this.activeTeam();
    if (voters.length === 0 || !voters.every((id) => this.missionVotes.has(id))) {
      return;
    }

    const votes: Record<string, string> = {};
    for (const id of voters) {
      votes[id] = (this.missionVotes.get(id) as MissionVote).toUpperCase();
    }

    let outcome: MissionOutcome;
    try {
      outcome = parseMissionOutcome(
        await this.engine("submit_mission_votes", { votes, voter_ids: voters }),
        this.requireRound().missionIndex + 1,
        this.proposedTeam,
      );
    } catch (error) {
      log.error("mission resolution failed", { roomId: this.roomId, error });
      this.missionVotes.clear();
      this.toRoom(SERVER_EVENTS.ERROR, { code: "vote_failed", message: "the mission could not be resolved, please vote again" });
      this.toRoom(SERVER_EVENTS.MISSION_PHASE, this.missionProgressPayload());
      return;
    }

    this.lastMission = outcome;
    this.scores = outcome.scores;
    this.missionHistory.push({
      missionIndex: outcome.missionIndex,
      team: outcome.team,
      naziVotes: outcome.naziVotes,
      result: outcome.result,
    });
    this.phase = "mission_result";
    this.missionResultConfirmed.clear();
    this.missionVotes.clear();
    this.toRoom(SERVER_EVENTS.MISSION_REVEALED, {
      missionIndex: outcome.missionIndex,
      team: [...outcome.team],
      naziVotes: outcome.naziVotes,
      result: outcome.result,
      scores: outcome.scores,
    });
  }

  private async tryCompleteMissionResult(): Promise<void> {
    if (!this.allActiveIn(this.missionResultConfirmed)) {
      return;
    }
    this.missionResultConfirmed.clear();
    const outcome = this.lastMission;
    if (outcome === null) {
      return;
    }

    if (outcome.gameWinner !== null || outcome.nextRound === null) {
      const winner = outcome.gameWinner ?? (this.scores.nazi > this.scores.communist ? "nazi" : "communist");
      this.gameOver = { winner, reason: "missions" };
      this.phase = "end_game";
      this.config.onGameDecided?.(this.summary());
      this.endGameConfirmed.clear();
      this.toRoom(SERVER_EVENTS.GAME_OVER, { ...this.gameOver, scores: this.scores });
      return;
    }

    this.round = outcome.nextRound;
    this.proposedTeam = [];
    this.lastConfidence = null;
    this.phase = "proposing";
    this.emitRoundStarted();
  }

  private async tryCompleteEndGame(): Promise<void> {
    if (this.phase !== "end_game" || !this.allActiveIn(this.endGameConfirmed)) {
      return;
    }
    this.phase = "finished";

    let nextChefId: string | null = null;
    try {
      const cursor = await this.engine("end_game", {});
      if (typeof cursor === "number" && Number.isInteger(cursor)) {
        nextChefId = this.turnOrder[cursor] ?? null;
      }
    } catch (error) {
      log.warn("engine end_game failed", { roomId: this.roomId, error });
    }

    this.toRoom(SERVER_EVENTS.ROLES_REVEALED, { roleMap: this.roleMap });
    this.dispose();
    this.config.onGameFinished(nextChefId, this.summary());
  }

  // ---------------------------------------------------------------- émissions

  private emitTableOrderUpdate(): void {
    const active = this.activeIds();
    this.toRoom(SERVER_EVENTS.TABLE_ORDER_UPDATED, {
      taps: this.tableOrder.length,
      playerCount: active.length,
      completed: this.tableOrderComplete(),
      order: [...this.tableOrder],
      confirmed: [...this.tableOrderConfirmed],
    });
  }

  private emitRoundStarted(): void {
    this.toRoom(SERVER_EVENTS.PROPOSAL_PHASE, this.proposalPayload());
  }

  private emitMissionProgress(): void {
    this.toRoom(SERVER_EVENTS.MISSION_PROGRESS, this.missionProgressPayload());
  }

  private proposalPayload(): { chef: string; missionSize: number; missionIndex: number; team: string[] } {
    const round = this.requireRound();
    return {
      chef: round.chefId,
      missionSize: round.requiredTeamSize,
      missionIndex: round.missionIndex + 1,
      team: this.phase === "proposing" ? [] : [...this.proposedTeam],
    };
  }

  private missionProgressPayload(): { team: string[]; votesSubmitted: number; votesRequired: number; submittedPlayerIds: string[] } {
    return {
      team: [...this.proposedTeam],
      votesSubmitted: this.missionVotes.size,
      votesRequired: this.activeTeam().length,
      submittedPlayerIds: [...this.missionVotes.keys()],
    };
  }

  private rolePayload(playerId: string): { role: Faction; roleMap?: RoleMap } | null {
    const view = this.playerViews.get(playerId);
    const role = view?.[playerId];
    if (view === undefined || role === undefined) {
      return null;
    }
    // Un joueur ne reçoit que ce que le moteur l'autorise à voir (get_player_view).
    return Object.keys(view).length > 1 ? { role, roleMap: { ...view } } : { role };
  }

  private buildResyncPayload(playerId: string): ResyncPayload {
    return {
      room: this.config.getRoomPayload(),
      phase: this.flowPhase(),
      missionCount: this.config.ruleset.missionCount,
      missionSizes: [...this.config.ruleset.missionSizes],
      scores: { ...this.scores },
      tableOrder: [...this.tableOrder],
      tableOrderConfirmed: [...this.tableOrderConfirmed],
      turnOrder: [...this.turnOrder],
      role: this.rolePayload(playerId),
      proposal: this.round === null ? null : this.proposalPayload(),
      confidence:
        this.lastConfidence === null
          ? null
          : { votes: this.lastConfidence.votes, result: this.lastConfidence.approved ? "yes" : "no", approved: this.lastConfidence.approved },
      hasVotedConfidence: this.confidenceVotes.has(playerId),
      hasVotedMission: this.missionVotes.has(playerId),
      hasConfirmed: this.confirmationSetForPhase()?.has(playerId) ?? false,
      mission:
        this.lastMission === null || (this.phase !== "mission_result" && this.phase !== "end_game")
          ? null
          : {
              missionIndex: this.lastMission.missionIndex,
              team: [...this.lastMission.team],
              naziVotes: this.lastMission.naziVotes,
              result: this.lastMission.result,
              scores: { ...this.lastMission.scores },
            },
      missionProgress: this.phase === "mission" ? this.missionProgressPayload() : null,
      confidenceHistory: this.confidenceHistory.map((entry) => ({ ...entry })),
      missionHistory: this.missionHistory.map((entry) => ({ ...entry })),
      gameOver: this.gameOver === null ? null : { ...this.gameOver },
    };
  }

  private confirmationSetForPhase(): Set<string> | null {
    switch (this.phase) {
      case "table_order":
        return this.tableOrderConfirmed;
      case "revealing":
        return this.revealedPlayers;
      case "confidence_result":
        return this.confidenceResultConfirmed;
      case "mission_result":
        return this.missionResultConfirmed;
      case "end_game":
        return this.endGameConfirmed;
      default:
        return null;
    }
  }

  private flowPhase(): FlowPhase {
    const mapping: Record<SessionPhase, FlowPhase> = {
      table_order: "table_order",
      revealing: "role_reveal",
      proposing: "proposing",
      voting: "confidence_vote",
      confidence_result: "confidence_result",
      mission: "mission_vote",
      mission_result: "mission_result",
      end_game: "end_game",
      finished: "replay_waiting",
    };
    return mapping[this.phase];
  }

  private toRoom(event: string, payload?: unknown): void {
    if (this.disposed && event !== SERVER_EVENTS.ERROR && event !== SERVER_EVENTS.GAME_ABORTED && event !== SERVER_EVENTS.ROLES_REVEALED) {
      return;
    }
    this.io.to(this.roomId).emit(event, payload);
    this.notifyTurn(event);
  }

  private toPlayer(playerId: string, event: string, payload?: unknown): void {
    const socketId = this.socketByPlayer.get(playerId);
    if (socketId !== undefined && !this.disposed) {
      this.io.to(socketId).emit(event, payload);
    }
  }

  // ---------------------------------------------------------------- utilitaires

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const run = this.queue.then(() => {
      if (this.disposed) {
        throw new Error("the game is no longer running");
      }
      return action();
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private engine(command: string, args: Record<string, unknown>): Promise<unknown> {
    return this.bridge.send(command, args);
  }

  /** Qui doit agir après cet événement ; la room décide qui prévenir (écran éteint, déconnecté). */
  private notifyTurn(event: string): void {
    if (this.config.onTurn === undefined || this.disposed) return;
    if (event === SERVER_EVENTS.PROPOSAL_PHASE && this.phase === "proposing" && this.round !== null) {
      this.config.onTurn([this.round.chefId], "proposal");
    } else if (event === SERVER_EVENTS.CONFIDENCE_PHASE) {
      this.config.onTurn(this.activeIds(), "vote");
    } else if (event === SERVER_EVENTS.MISSION_PHASE) {
      this.config.onTurn(this.activeTeam(), "mission");
    }
  }

  private activeIds(): string[] {
    const active = new Set(this.config.getActivePlayerIds());
    return this.playerIds.filter((id) => active.has(id));
  }

  private activeTeam(): string[] {
    const active = new Set(this.activeIds());
    return this.proposedTeam.filter((id) => active.has(id));
  }

  private allActiveIn(set: Set<string>): boolean {
    const active = this.activeIds();
    return active.length > 0 && active.every((id) => set.has(id));
  }

  private tableOrderComplete(): boolean {
    const active = this.activeIds();
    return active.length > 0 && active.every((id) => this.tableOrder.includes(id));
  }

  private requireRound(): RoundInfo {
    if (this.round === null) {
      throw new Error("no round in progress");
    }
    return this.round;
  }

  private ensureKnownPlayer(playerId: string): void {
    if (!this.playerIds.includes(playerId)) {
      throw new Error("unknown player id for this session");
    }
  }

  private ensurePhase(expected: SessionPhase): void {
    if (this.phase !== expected) {
      throw new Error(`action not allowed now (expected ${expected}, current ${this.phase})`);
    }
  }

  private clampIndex(index: number, length: number): number {
    return Number.isInteger(index) ? Math.max(0, Math.min(length - 1, index)) : 0;
  }

  private async pause(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}

// ---------------------------------------------------------------- validation des réponses moteur

function asRecord(raw: unknown, context: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`invalid engine response for ${context}`);
  }
  return raw as Record<string, unknown>;
}

function parseFaction(raw: unknown): Faction {
  if (raw === "nazi" || raw === "communist") {
    return raw;
  }
  throw new Error(`unexpected faction from engine: ${String(raw)}`);
}

function parseScores(raw: unknown): Scores {
  const record = asRecord(raw, "scores");
  if (typeof record.nazi !== "number" || typeof record.communist !== "number") {
    throw new Error("invalid scores from engine");
  }
  return { nazi: record.nazi, communist: record.communist };
}

function parseRound(raw: unknown): { info: RoundInfo; scores: Scores } {
  const record = asRecord(raw, "round");
  if (
    typeof record.mission_index !== "number" ||
    typeof record.chef_id !== "string" ||
    typeof record.required_team_size !== "number"
  ) {
    throw new Error("invalid round state from engine");
  }
  return {
    info: { missionIndex: record.mission_index, chefId: record.chef_id, requiredTeamSize: record.required_team_size },
    scores: parseScores(record.scores),
  };
}

function parsePlayerView(raw: unknown, playerId: string): PlayerView {
  const record = asRecord(raw, "get_player_view");
  const view: PlayerView = {};
  for (const [id, faction] of Object.entries(record)) {
    view[id] = parseFaction(faction);
  }
  if (view[playerId] === undefined) {
    throw new Error("engine player view is missing the player's own role");
  }
  return view;
}

function parseMissionOutcome(raw: unknown, missionIndex: number, team: string[]): MissionOutcome {
  const record = asRecord(raw, "submit_mission_votes");
  if (typeof record.nazi_vote_count !== "number") {
    throw new Error("invalid mission result from engine");
  }
  return {
    missionIndex,
    team: [...team],
    naziVotes: record.nazi_vote_count,
    result: parseFaction(record.winner),
    scores: parseScores(record.scores),
    gameWinner: record.game_winner === null || record.game_winner === undefined ? null : parseFaction(record.game_winner),
    nextRound: record.next_round === null || record.next_round === undefined ? null : parseRound(record.next_round).info,
  };
}
