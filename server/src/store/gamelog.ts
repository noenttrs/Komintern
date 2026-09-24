import crypto from "crypto";

import type { Collection, Db } from "mongodb";

import type { ConfidenceHistoryEntry, Faction, MissionHistoryEntry, Scores } from "../types";

export type LoggedPlayer = { playerId: string; userId: string | null; pseudo: string; faction: Faction | null };

export type LoggedChatMessage = { id: string; playerId: string; pseudo: string; text: string; masked: boolean; at: Date };

export type GameLog = {
  id: string;
  roomCode: string;
  startedAt: Date;
  endedAt: Date;
  outcome: "finished" | "aborted";
  ruleset: unknown;
  players: LoggedPlayer[];
  turnOrder: string[];
  confidenceHistory: ConfidenceHistoryEntry[];
  missionHistory: MissionHistoryEntry[];
  scores: Scores;
  winner: Faction | null;
  reason: "missions" | "forfeit" | null;
  forfeitedBy: string | null;
  /** Duel à 2 : gagnants et raison (absent pour une partie à missions). */
  duel?: { winners: string[]; reason: string } | null;
  chat: LoggedChatMessage[];
  anonymizedAt: Date | null;
};

export type ModerationMessage = { pseudonym: string; text: string; at: Date; flagged: boolean };

export type ModerationCase = {
  id: string;
  createdAt: Date;
  status: "open" | "resolved";
  trigger: { type: "flagged_word"; words: string[]; categories?: string[] } | { type: "report"; reporter: string; reason: string };
  roomCode: string;
  gameId: string | null;
  messages: ModerationMessage[];
  resolvedAt: Date | null;
  resolution: string | null;
};

/** Correspondance pseudonyme ↔ personne, stockée à part et lue seulement en cas de recours. */
export type ModerationIdentity = { pseudonym: string; playerId: string; userId: string | null; pseudo: string };

/**
 * Demande de ban définitif faite par un modérateur sur un pseudonyme d'un dossier. Le serveur
 * retrouve la personne ; seul l'admin tranche, avec accès au dossier.
 */
export type BanRequest = {
  id: string;
  caseId: string;
  pseudonym: string;
  reason: string;
  requestedBy: string;
  createdAt: Date;
  status: "pending" | "accepted" | "rejected";
  decidedAt: Date | null;
  decidedBy: string | null;
};

/** Journal des actions de modération ; `actor` : qui l'a faite (pseudo et rôle). */
export type AuditEntry = { caseId: string; action: string; at: Date; detail?: string; actor?: string };

/** Une partie vue par un joueur : ce qu'il a le droit de revoir sur son profil. */
export type PlayedGame = {
  id: string;
  endedAt: Date;
  playerCount: number;
  faction: Faction | null;
  winner: Faction | null;
  won: boolean | null;
  reason: "missions" | "forfeit" | null;
  mode: "missions" | "duel";
  duelReason: string | null;
  scores: Scores;
  missions: Array<{ missionIndex: number; result: Faction; naziVotes: number; teamSize: number }>;
  teammates: string[];
};

export function toPlayedGame(log: GameLog, userId: string): PlayedGame | null {
  const me = log.players.find((player) => player.userId === userId);
  if (me === undefined) return null;
  return {
    id: log.id,
    endedAt: log.endedAt,
    playerCount: log.players.length,
    faction: me.faction,
    winner: log.winner,
    won: log.duel != null ? log.duel.winners.includes(me.playerId) : log.winner === null || me.faction === null ? null : log.winner === me.faction,
    reason: log.reason,
    mode: log.duel != null ? "duel" : "missions",
    duelReason: log.duel?.reason ?? null,
    scores: log.scores,
    missions: log.missionHistory.map((mission) => ({
      missionIndex: mission.missionIndex,
      result: mission.result,
      naziVotes: mission.naziVotes,
      teamSize: mission.team.length,
    })),
    teammates: log.players.filter((player) => player.playerId !== me.playerId).map((player) => player.pseudo),
  };
}

export type GameLogStats = {
  total: number;
  finished: number;
  aborted: number;
  last24h: number;
  last7d: number;
  winsNazi: number;
  winsCommunist: number;
  forfeits: number;
  openCases: number;
  totalCases: number;
};

/**
 * Partie vue par l'administration : uniquement des données anonymes (ni pseudo, ni compte,
 * ni message). L'identité des joueurs ne se consulte que via un dossier de modération, tracé.
 */
export type AdminGameRow = {
  id: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  playerCount: number;
  /** Nombre de joueurs connectés à un compte (sans dire lesquels). */
  accounts: number;
  mode: "missions" | "duel";
  /** « 5J », « perso » ou « duel ». */
  format: string;
  outcome: GameLog["outcome"];
  winner: Faction | null;
  reason: GameLog["reason"] | "duel";
  duelWinners: number | null;
  missions: Faction[];
  chatMessages: number;
  moderated: boolean;
};

export function toAdminGameRow(log: GameLog, moderatedGameIds: Set<string>): AdminGameRow {
  const ruleset = (log.ruleset ?? {}) as { ruleset_preset?: unknown; ruleset?: unknown; mode?: unknown };
  const duel = log.duel != null || ruleset.mode === "duel";
  const preset = typeof ruleset.ruleset_preset === "string" ? ruleset.ruleset_preset.replace("PRESET_", "") : null;
  return {
    id: log.id,
    startedAt: log.startedAt,
    endedAt: log.endedAt,
    durationSeconds: Math.max(0, Math.round((new Date(log.endedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)),
    playerCount: log.players.length,
    accounts: log.players.filter((player) => player.userId !== null).length,
    mode: duel ? "duel" : "missions",
    format: duel ? "duel" : (preset ?? (ruleset.ruleset !== undefined ? "perso" : `${log.players.length}J`)),
    outcome: log.outcome,
    winner: log.winner,
    reason: duel ? (log.reason === "forfeit" ? "forfeit" : "duel") : log.reason,
    duelWinners: log.duel != null ? log.duel.winners.length : null,
    missions: log.missionHistory.map((mission) => mission.result),
    chatMessages: log.chat.length,
    moderated: moderatedGameIds.has(log.id),
  };
}

export interface GameLogStore {
  /** Administration : dernières parties, anonymes, les plus récentes d'abord. */
  recentGames(limit: number, before?: Date): Promise<AdminGameRow[]>;
  insertGame(log: GameLog): Promise<void>;
  /** Remplace pseudos et comptes par « Joueur A, B… » et efface le texte du chat ; renvoie le nombre de parties traitées. */
  anonymizeGamesBefore(before: Date, keepGameIds: string[]): Promise<number>;
  /** Dossiers clos avant `before` : messages et identités supprimés (décision et audit gardés). */
  purgeResolvedCasesBefore(before: Date): Promise<number>;
  /** Suppression de compte : retire le lien vers le compte dans tous les logs. */
  detachUser(userId: string): Promise<void>;
  createCase(moderationCase: ModerationCase, identities: ModerationIdentity[]): Promise<void>;
  listCases(status?: ModerationCase["status"]): Promise<ModerationCase[]>;
  getCase(id: string): Promise<ModerationCase | null>;
  getIdentities(caseId: string): Promise<ModerationIdentity[]>;
  resolveCase(id: string, resolution: string): Promise<boolean>;
  openCaseGameIds(): Promise<string[]>;
  audit(entry: AuditEntry): Promise<void>;
  createBanRequest(request: BanRequest): Promise<void>;
  listBanRequests(status?: BanRequest["status"]): Promise<BanRequest[]>;
  getBanRequest(id: string): Promise<BanRequest | null>;
  decideBanRequest(id: string, status: "accepted" | "rejected", decidedBy: string): Promise<boolean>;
  auditTrail(caseId: string): Promise<AuditEntry[]>;
  stats(now?: Date): Promise<GameLogStats>;
  /** Parties terminées d'un compte, les plus récentes d'abord. */
  gamesForUser(userId: string, limit: number): Promise<PlayedGame[]>;
}

export function newLogId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function pseudonymFor(index: number): string {
  // A…Z puis AA, AB… : largement assez pour une room de 11 joueurs.
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Joueur ${name}`;
}

export function anonymizeGame(log: GameLog, now: Date): GameLog {
  const names = new Map(log.players.map((player, index) => [player.playerId, pseudonymFor(index)]));
  return {
    ...log,
    players: log.players.map((player) => ({ ...player, userId: null, pseudo: names.get(player.playerId) ?? "Joueur ?" })),
    // Le texte des messages peut contenir des données personnelles : seul leur nombre est gardé.
    chat: log.chat.map((message) => ({ ...message, pseudo: names.get(message.playerId) ?? "Joueur ?", text: "" })),
    anonymizedAt: now,
  };
}

type WithMongoId<T extends { id: string }> = Omit<T, "id"> & { _id: string };

function toDoc<T extends { id: string }>(value: T): WithMongoId<T> {
  const { id, ...rest } = value;
  return { _id: id, ...rest } as WithMongoId<T>;
}

function fromDoc<T extends { id: string }>(doc: WithMongoId<T>): T {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as unknown as T;
}

export class MongoGameLogStore implements GameLogStore {
  private readonly games: Collection<WithMongoId<GameLog>>;
  private readonly cases: Collection<WithMongoId<ModerationCase>>;
  private readonly identities: Collection<{ _id: string; entries: ModerationIdentity[] }>;
  private readonly banRequests: Collection<WithMongoId<BanRequest>>;
  private readonly audits: Collection<AuditEntry>;

  public constructor(db: Db) {
    this.games = db.collection("games");
    this.cases = db.collection("moderation_cases");
    this.identities = db.collection("moderation_identities");
    this.banRequests = db.collection("ban_requests");
    this.audits = db.collection("moderation_audit");
  }

  public async ensureIndexes(): Promise<void> {
    await this.games.createIndex({ endedAt: 1, anonymizedAt: 1 });
    await this.games.createIndex({ "players.userId": 1 });
    await this.cases.createIndex({ status: 1, createdAt: -1 });
    await this.audits.createIndex({ caseId: 1, at: 1 });
  }

  public async insertGame(log: GameLog): Promise<void> {
    await this.games.insertOne(toDoc(log));
  }

  public async anonymizeGamesBefore(before: Date, keepGameIds: string[]): Promise<number> {
    const now = new Date();
    let count = 0;
    const cursor = this.games.find({ endedAt: { $lt: before }, anonymizedAt: null, _id: { $nin: keepGameIds } });
    for await (const doc of cursor) {
      const anonymized = toDoc(anonymizeGame(fromDoc<GameLog>(doc), now));
      await this.games.updateOne({ _id: doc._id }, { $set: { players: anonymized.players, chat: anonymized.chat, anonymizedAt: now } });
      count += 1;
    }
    return count;
  }

  public async detachUser(userId: string): Promise<void> {
    await this.games.updateMany({ "players.userId": userId }, { $set: { "players.$[p].userId": null } }, { arrayFilters: [{ "p.userId": userId }] });
  }

  public async createCase(moderationCase: ModerationCase, identities: ModerationIdentity[]): Promise<void> {
    await this.cases.insertOne(toDoc(moderationCase));
    await this.identities.insertOne({ _id: moderationCase.id, entries: identities });
  }

  public async listCases(status?: ModerationCase["status"]): Promise<ModerationCase[]> {
    return (await this.cases.find(status === undefined ? {} : { status }).sort({ createdAt: -1 }).limit(200).toArray()).map((doc) => fromDoc<ModerationCase>(doc));
  }

  public async getCase(id: string): Promise<ModerationCase | null> {
    const doc = await this.cases.findOne({ _id: id });
    return doc === null ? null : fromDoc<ModerationCase>(doc);
  }

  public async getIdentities(caseId: string): Promise<ModerationIdentity[]> {
    return (await this.identities.findOne({ _id: caseId }))?.entries ?? [];
  }

  public async resolveCase(id: string, resolution: string): Promise<boolean> {
    const result = await this.cases.updateOne({ _id: id, status: "open" }, { $set: { status: "resolved", resolvedAt: new Date(), resolution } });
    return result.modifiedCount === 1;
  }

  public async openCaseGameIds(): Promise<string[]> {
    return (await this.cases.distinct("gameId", { status: "open", gameId: { $ne: null } })) as string[];
  }

  public async purgeResolvedCasesBefore(before: Date): Promise<number> {
    const ids = (await this.cases.find({ status: "resolved", resolvedAt: { $lt: before }, "messages.0": { $exists: true } }, { projection: { _id: 1 } }).toArray()).map((doc) => doc._id);
    if (ids.length === 0) return 0;
    await this.cases.updateMany({ _id: { $in: ids } }, { $set: { messages: [] } });
    await this.identities.deleteMany({ _id: { $in: ids } });
    return ids.length;
  }

  public async createBanRequest(request: BanRequest): Promise<void> {
    await this.banRequests.insertOne(toDoc(request));
  }

  public async listBanRequests(status?: BanRequest["status"]): Promise<BanRequest[]> {
    return (await this.banRequests.find(status === undefined ? {} : { status }).sort({ createdAt: -1 }).limit(200).toArray()).map((doc) => fromDoc<BanRequest>(doc));
  }

  public async getBanRequest(id: string): Promise<BanRequest | null> {
    const doc = await this.banRequests.findOne({ _id: id });
    return doc === null ? null : fromDoc<BanRequest>(doc);
  }

  public async decideBanRequest(id: string, status: "accepted" | "rejected", decidedBy: string): Promise<boolean> {
    const result = await this.banRequests.updateOne({ _id: id, status: "pending" }, { $set: { status, decidedAt: new Date(), decidedBy } });
    return result.modifiedCount === 1;
  }

  public async audit(entry: AuditEntry): Promise<void> {
    await this.audits.insertOne({ ...entry });
  }

  public async auditTrail(caseId: string): Promise<AuditEntry[]> {
    return this.audits.find({ caseId }, { projection: { _id: 0 } }).sort({ at: 1 }).toArray();
  }

  public async gamesForUser(userId: string, limit: number): Promise<PlayedGame[]> {
    const docs = await this.games.find({ "players.userId": userId, outcome: "finished" }).sort({ endedAt: -1 }).limit(limit).toArray();
    return docs.map((doc) => toPlayedGame(fromDoc<GameLog>(doc), userId)).filter((game): game is PlayedGame => game !== null);
  }

  public async recentGames(limit: number, before?: Date): Promise<AdminGameRow[]> {
    const docs = await this.games
      .find(before === undefined ? {} : { endedAt: { $lt: before } })
      .sort({ endedAt: -1 })
      .limit(limit)
      .toArray();
    const logs = docs.map((doc) => fromDoc<GameLog>(doc));
    const moderated = new Set(((await this.cases.distinct("gameId", { gameId: { $in: logs.map((log) => log.id) } })) as string[]));
    return logs.map((log) => toAdminGameRow(log, moderated));
  }

  public async stats(now = new Date()): Promise<GameLogStats> {
    const day = new Date(now.getTime() - 24 * 3600 * 1000);
    const week = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const [total, finished, last24h, last7d, winsNazi, winsCommunist, forfeits, openCases, totalCases] = await Promise.all([
      this.games.countDocuments(),
      this.games.countDocuments({ outcome: "finished" }),
      this.games.countDocuments({ endedAt: { $gte: day } }),
      this.games.countDocuments({ endedAt: { $gte: week } }),
      this.games.countDocuments({ outcome: "finished", winner: "nazi" }),
      this.games.countDocuments({ outcome: "finished", winner: "communist" }),
      this.games.countDocuments({ reason: "forfeit" }),
      this.cases.countDocuments({ status: "open" }),
      this.cases.countDocuments(),
    ]);
    return { total, finished, aborted: total - finished, last24h, last7d, winsNazi, winsCommunist, forfeits, openCases, totalCases };
  }
}

export class MemoryGameLogStore implements GameLogStore {
  public readonly games = new Map<string, GameLog>();
  public readonly cases = new Map<string, ModerationCase>();
  public readonly identities = new Map<string, ModerationIdentity[]>();
  public readonly audits: AuditEntry[] = [];

  public async insertGame(log: GameLog): Promise<void> {
    this.games.set(log.id, structuredClone(log));
  }

  public async anonymizeGamesBefore(before: Date, keepGameIds: string[]): Promise<number> {
    let count = 0;
    for (const [id, log] of this.games) {
      if (log.endedAt < before && log.anonymizedAt === null && !keepGameIds.includes(id)) {
        this.games.set(id, anonymizeGame(log, new Date()));
        count += 1;
      }
    }
    return count;
  }

  public async detachUser(userId: string): Promise<void> {
    for (const log of this.games.values()) {
      for (const player of log.players) {
        if (player.userId === userId) player.userId = null;
      }
    }
  }

  public async createCase(moderationCase: ModerationCase, identities: ModerationIdentity[]): Promise<void> {
    this.cases.set(moderationCase.id, structuredClone(moderationCase));
    this.identities.set(moderationCase.id, structuredClone(identities));
  }

  public async recentGames(limit: number, before?: Date): Promise<AdminGameRow[]> {
    const moderated = new Set([...this.cases.values()].map((c) => c.gameId).filter((id): id is string => id !== null));
    return [...this.games.values()]
      .filter((log) => before === undefined || log.endedAt < before)
      .sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime())
      .slice(0, limit)
      .map((log) => toAdminGameRow(log, moderated));
  }

  public async listCases(status?: ModerationCase["status"]): Promise<ModerationCase[]> {
    return [...this.cases.values()].filter((c) => status === undefined || c.status === status);
  }

  public async getCase(id: string): Promise<ModerationCase | null> {
    return this.cases.get(id) ?? null;
  }

  public async getIdentities(caseId: string): Promise<ModerationIdentity[]> {
    return this.identities.get(caseId) ?? [];
  }

  public async resolveCase(id: string, resolution: string): Promise<boolean> {
    const moderationCase = this.cases.get(id);
    if (moderationCase === undefined || moderationCase.status !== "open") return false;
    Object.assign(moderationCase, { status: "resolved", resolvedAt: new Date(), resolution });
    return true;
  }

  public async openCaseGameIds(): Promise<string[]> {
    return [...this.cases.values()].filter((c) => c.status === "open" && c.gameId !== null).map((c) => c.gameId as string);
  }

  public async purgeResolvedCasesBefore(before: Date): Promise<number> {
    let count = 0;
    for (const moderationCase of this.cases.values()) {
      if (moderationCase.status === "resolved" && moderationCase.resolvedAt !== null && moderationCase.resolvedAt < before && moderationCase.messages.length > 0) {
        moderationCase.messages = [];
        this.identities.delete(moderationCase.id);
        count += 1;
      }
    }
    return count;
  }

  public readonly banRequests = new Map<string, BanRequest>();

  public async createBanRequest(request: BanRequest): Promise<void> {
    this.banRequests.set(request.id, { ...request });
  }

  public async listBanRequests(status?: BanRequest["status"]): Promise<BanRequest[]> {
    return [...this.banRequests.values()].filter((request) => status === undefined || request.status === status).map((request) => ({ ...request }));
  }

  public async getBanRequest(id: string): Promise<BanRequest | null> {
    const request = this.banRequests.get(id);
    return request === undefined ? null : { ...request };
  }

  public async decideBanRequest(id: string, status: "accepted" | "rejected", decidedBy: string): Promise<boolean> {
    const request = this.banRequests.get(id);
    if (request === undefined || request.status !== "pending") return false;
    Object.assign(request, { status, decidedAt: new Date(), decidedBy });
    return true;
  }

  public async audit(entry: AuditEntry): Promise<void> {
    this.audits.push(entry);
  }

  public async auditTrail(caseId: string): Promise<AuditEntry[]> {
    return this.audits.filter((entry) => entry.caseId === caseId);
  }

  public async gamesForUser(userId: string, limit: number): Promise<PlayedGame[]> {
    return [...this.games.values()]
      .filter((log) => log.outcome === "finished")
      .sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime())
      .map((log) => toPlayedGame(log, userId))
      .filter((game): game is PlayedGame => game !== null)
      .slice(0, limit);
  }

  public async stats(now = new Date()): Promise<GameLogStats> {
    const games = [...this.games.values()];
    const since = (ms: number) => games.filter((g) => g.endedAt.getTime() >= now.getTime() - ms).length;
    const finished = games.filter((g) => g.outcome === "finished");
    const cases = [...this.cases.values()];
    return {
      total: games.length,
      finished: finished.length,
      aborted: games.length - finished.length,
      last24h: since(24 * 3600 * 1000),
      last7d: since(7 * 24 * 3600 * 1000),
      winsNazi: finished.filter((g) => g.winner === "nazi").length,
      winsCommunist: finished.filter((g) => g.winner === "communist").length,
      forfeits: games.filter((g) => g.reason === "forfeit").length,
      openCases: cases.filter((c) => c.status === "open").length,
      totalCases: cases.length,
    };
  }
}
