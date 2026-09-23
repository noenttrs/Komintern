import crypto from "crypto";

import type { Collection, Db } from "mongodb";

import type { Faction } from "../types";

export type UserStats = {
  wins: number;
  losses: number;
  gamesNazi: number;
  gamesCommunist: number;
  winsNazi: number;
  winsCommunist: number;
};

export type User = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  passwordHash: string | null;
  googleSub: string | null;
  /** Pseudo unique ; null juste après une première connexion Google, le temps de le choisir. */
  displayName: string | null;
  createdAt: Date;
  stats: UserStats;
  bannedUntil: Date | null;
  /** Rôle attribué uniquement en ligne de commande côté serveur, jamais depuis le site. */
  role: "admin" | null;
  /** Secret TOTP (base32) de la double authentification, obligatoire pour les admins. */
  totpSecret: string | null;
};

export type NewUser = Pick<User, "email" | "emailVerified" | "passwordHash" | "googleSub" | "displayName">;
export type UserPatch = Partial<
  Pick<User, "email" | "emailVerified" | "passwordHash" | "googleSub" | "displayName" | "bannedUntil" | "role" | "totpSecret">
>;

/** Violation d'unicité (email, pseudo ou compte Google déjà utilisé). */
export class DuplicateError extends Error {
  public constructor(public readonly field: "email" | "displayName" | "googleSub") {
    super(`${field} already in use`);
    this.name = "DuplicateError";
  }
}

export interface UserStore {
  create(input: NewUser): Promise<User>;
  findById(id: string): Promise<User | null>;
  findManyByIds(ids: string[]): Promise<User[]>;
  findByEmail(email: string): Promise<User | null>;
  findByDisplayName(displayName: string): Promise<User | null>;
  findByGoogleSub(sub: string): Promise<User | null>;
  update(id: string, patch: UserPatch): Promise<User | null>;
  recordGameResult(id: string, result: { won: boolean; faction: Faction }): Promise<void>;
  delete(id: string): Promise<void>;
  countAll(): Promise<{ total: number; verified: number }>;
}

const EMPTY_STATS: UserStats = { wins: 0, losses: 0, gamesNazi: 0, gamesCommunist: 0, winsNazi: 0, winsCommunist: 0 };

export function newUserId(): string {
  return `u_${crypto.randomBytes(12).toString("hex")}`;
}

function statsIncrement(result: { won: boolean; faction: Faction }): UserStats {
  return {
    wins: result.won ? 1 : 0,
    losses: result.won ? 0 : 1,
    gamesNazi: result.faction === "nazi" ? 1 : 0,
    gamesCommunist: result.faction === "communist" ? 1 : 0,
    winsNazi: result.won && result.faction === "nazi" ? 1 : 0,
    winsCommunist: result.won && result.faction === "communist" ? 1 : 0,
  };
}

type UserDoc = Omit<User, "id"> & { _id: string; displayNameLower: string | null };

function fromDoc(doc: UserDoc): User {
  return {
    id: doc._id,
    email: doc.email,
    emailVerified: doc.emailVerified,
    passwordHash: doc.passwordHash,
    googleSub: doc.googleSub,
    displayName: doc.displayName,
    createdAt: doc.createdAt,
    stats: { ...EMPTY_STATS, ...doc.stats },
    bannedUntil: doc.bannedUntil ?? null,
    role: doc.role ?? null,
    totpSecret: doc.totpSecret ?? null,
  };
}

export class MongoUserStore implements UserStore {
  private readonly users: Collection<UserDoc>;

  public constructor(db: Db) {
    this.users = db.collection<UserDoc>("users");
  }

  public async ensureIndexes(): Promise<void> {
    // Index partiels : l'unicité ne s'applique qu'aux valeurs renseignées.
    await this.users.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
    await this.users.createIndex(
      { displayNameLower: 1 },
      { unique: true, partialFilterExpression: { displayNameLower: { $type: "string" } } },
    );
    await this.users.createIndex({ googleSub: 1 }, { unique: true, partialFilterExpression: { googleSub: { $type: "string" } } });
  }

  public async create(input: NewUser): Promise<User> {
    const doc: UserDoc = {
      _id: newUserId(),
      ...input,
      displayNameLower: input.displayName?.toLowerCase() ?? null,
      createdAt: new Date(),
      stats: { ...EMPTY_STATS },
      bannedUntil: null,
      role: null,
      totpSecret: null,
    };
    try {
      await this.users.insertOne(doc);
    } catch (error) {
      throw translateDuplicate(error);
    }
    return fromDoc(doc);
  }

  public async findById(id: string): Promise<User | null> {
    const doc = await this.users.findOne({ _id: id });
    return doc === null ? null : fromDoc(doc);
  }

  public async findManyByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) {
      return [];
    }
    return (await this.users.find({ _id: { $in: ids } }).toArray()).map(fromDoc);
  }

  public async findByEmail(email: string): Promise<User | null> {
    const doc = await this.users.findOne({ email: email.toLowerCase() });
    return doc === null ? null : fromDoc(doc);
  }

  public async findByDisplayName(displayName: string): Promise<User | null> {
    const doc = await this.users.findOne({ displayNameLower: displayName.toLowerCase() });
    return doc === null ? null : fromDoc(doc);
  }

  public async findByGoogleSub(sub: string): Promise<User | null> {
    const doc = await this.users.findOne({ googleSub: sub });
    return doc === null ? null : fromDoc(doc);
  }

  public async update(id: string, patch: UserPatch): Promise<User | null> {
    const set: Partial<UserDoc> = { ...patch };
    if (patch.displayName !== undefined) {
      set.displayNameLower = patch.displayName?.toLowerCase() ?? null;
    }
    try {
      const doc = await this.users.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: "after" });
      return doc === null ? null : fromDoc(doc);
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  public async recordGameResult(id: string, result: { won: boolean; faction: Faction }): Promise<void> {
    const inc = statsIncrement(result);
    await this.users.updateOne(
      { _id: id },
      {
        $inc: {
          "stats.wins": inc.wins,
          "stats.losses": inc.losses,
          "stats.gamesNazi": inc.gamesNazi,
          "stats.gamesCommunist": inc.gamesCommunist,
          "stats.winsNazi": inc.winsNazi,
          "stats.winsCommunist": inc.winsCommunist,
        },
      },
    );
  }

  public async delete(id: string): Promise<void> {
    await this.users.deleteOne({ _id: id });
  }

  public async countAll(): Promise<{ total: number; verified: number }> {
    const [total, verified] = await Promise.all([this.users.countDocuments(), this.users.countDocuments({ emailVerified: true })]);
    return { total, verified };
  }
}

function translateDuplicate(error: unknown): unknown {
  const mongo = error as { code?: number; keyPattern?: Record<string, unknown> };
  if (mongo.code === 11000) {
    const key = Object.keys(mongo.keyPattern ?? {})[0];
    if (key === "email") return new DuplicateError("email");
    if (key === "googleSub") return new DuplicateError("googleSub");
    return new DuplicateError("displayName");
  }
  return error;
}

export class MemoryUserStore implements UserStore {
  private readonly users = new Map<string, User>();

  private checkUnique(candidate: NewUser | UserPatch, ignoreId?: string): void {
    for (const user of this.users.values()) {
      if (user.id === ignoreId) continue;
      if (candidate.email && user.email === candidate.email) throw new DuplicateError("email");
      if (candidate.googleSub && user.googleSub === candidate.googleSub) throw new DuplicateError("googleSub");
      if (candidate.displayName && user.displayName?.toLowerCase() === candidate.displayName.toLowerCase()) {
        throw new DuplicateError("displayName");
      }
    }
  }

  public async create(input: NewUser): Promise<User> {
    this.checkUnique(input);
    const user: User = { id: newUserId(), ...input, createdAt: new Date(), stats: { ...EMPTY_STATS }, bannedUntil: null, role: null, totpSecret: null };
    this.users.set(user.id, user);
    return { ...user };
  }

  public async findById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user === undefined ? null : { ...user, stats: { ...user.stats } };
  }

  public async findManyByIds(ids: string[]): Promise<User[]> {
    return ids.map((id) => this.users.get(id)).filter((user): user is User => user !== undefined);
  }

  public async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.email === email.toLowerCase()) ?? null;
  }

  public async findByDisplayName(displayName: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.displayName?.toLowerCase() === displayName.toLowerCase()) ?? null;
  }

  public async findByGoogleSub(sub: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.googleSub === sub) ?? null;
  }

  public async update(id: string, patch: UserPatch): Promise<User | null> {
    const user = this.users.get(id);
    if (user === undefined) return null;
    this.checkUnique(patch, id);
    Object.assign(user, patch);
    return { ...user };
  }

  public async recordGameResult(id: string, result: { won: boolean; faction: Faction }): Promise<void> {
    const user = this.users.get(id);
    if (user === undefined) return;
    const inc = statsIncrement(result);
    user.stats = Object.fromEntries(
      Object.entries(user.stats).map(([key, value]) => [key, value + inc[key as keyof UserStats]]),
    ) as UserStats;
  }

  public async delete(id: string): Promise<void> {
    this.users.delete(id);
  }

  public async countAll(): Promise<{ total: number; verified: number }> {
    const all = [...this.users.values()];
    return { total: all.length, verified: all.filter((user) => user.emailVerified).length };
  }
}
