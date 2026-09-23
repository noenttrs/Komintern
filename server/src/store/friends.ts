import type { Collection, Db } from "mongodb";

export type Friendship = {
  id: string;
  requester: string;
  addressee: string;
  status: "pending" | "accepted";
  createdAt: Date;
};

export interface FriendStore {
  /** Demande ; si l'autre avait déjà demandé, l'amitié est acceptée directement. */
  request(requester: string, addressee: string): Promise<Friendship>;
  get(a: string, b: string): Promise<Friendship | null>;
  accept(addressee: string, requester: string): Promise<boolean>;
  /** Refuse, annule ou supprime l'amitié, quel que soit son état. */
  remove(a: string, b: string): Promise<void>;
  listFor(userId: string): Promise<Friendship[]>;
  areFriends(a: string, b: string): Promise<boolean>;
  removeAllFor(userId: string): Promise<void>;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

type FriendshipDoc = Omit<Friendship, "id"> & { _id: string };

const fromDoc = (doc: FriendshipDoc): Friendship => ({
  id: doc._id,
  requester: doc.requester,
  addressee: doc.addressee,
  status: doc.status,
  createdAt: doc.createdAt,
});

export class MongoFriendStore implements FriendStore {
  private readonly friendships: Collection<FriendshipDoc>;

  public constructor(db: Db) {
    this.friendships = db.collection<FriendshipDoc>("friendships");
  }

  public async ensureIndexes(): Promise<void> {
    await this.friendships.createIndex({ requester: 1 });
    await this.friendships.createIndex({ addressee: 1 });
  }

  public async request(requester: string, addressee: string): Promise<Friendship> {
    const existing = await this.get(requester, addressee);
    if (existing !== null) {
      if (existing.status === "pending" && existing.requester === addressee) {
        await this.accept(requester, addressee);
        return { ...existing, status: "accepted" };
      }
      return existing;
    }
    // _id = paire triée : l'unicité est garantie par Mongo, même en cas de requêtes simultanées.
    const doc: FriendshipDoc = { _id: pairKey(requester, addressee), requester, addressee, status: "pending", createdAt: new Date() };
    try {
      await this.friendships.insertOne(doc);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return (await this.get(requester, addressee)) as Friendship;
      }
      throw error;
    }
    return fromDoc(doc);
  }

  public async get(a: string, b: string): Promise<Friendship | null> {
    const doc = await this.friendships.findOne({ _id: pairKey(a, b) });
    return doc === null ? null : fromDoc(doc);
  }

  public async accept(addressee: string, requester: string): Promise<boolean> {
    const result = await this.friendships.updateOne(
      { _id: pairKey(addressee, requester), addressee, requester, status: "pending" },
      { $set: { status: "accepted" } },
    );
    return result.modifiedCount === 1;
  }

  public async remove(a: string, b: string): Promise<void> {
    await this.friendships.deleteOne({ _id: pairKey(a, b) });
  }

  public async listFor(userId: string): Promise<Friendship[]> {
    return (await this.friendships.find({ $or: [{ requester: userId }, { addressee: userId }] }).toArray()).map(fromDoc);
  }

  public async areFriends(a: string, b: string): Promise<boolean> {
    return (await this.friendships.countDocuments({ _id: pairKey(a, b), status: "accepted" })) === 1;
  }

  public async removeAllFor(userId: string): Promise<void> {
    await this.friendships.deleteMany({ $or: [{ requester: userId }, { addressee: userId }] });
  }
}

export class MemoryFriendStore implements FriendStore {
  private readonly friendships = new Map<string, Friendship>();

  public async request(requester: string, addressee: string): Promise<Friendship> {
    const key = pairKey(requester, addressee);
    const existing = this.friendships.get(key);
    if (existing !== undefined) {
      if (existing.status === "pending" && existing.requester === addressee) {
        existing.status = "accepted";
      }
      return { ...existing };
    }
    const friendship: Friendship = { id: key, requester, addressee, status: "pending", createdAt: new Date() };
    this.friendships.set(key, friendship);
    return { ...friendship };
  }

  public async get(a: string, b: string): Promise<Friendship | null> {
    const friendship = this.friendships.get(pairKey(a, b));
    return friendship === undefined ? null : { ...friendship };
  }

  public async accept(addressee: string, requester: string): Promise<boolean> {
    const friendship = this.friendships.get(pairKey(addressee, requester));
    if (friendship === undefined || friendship.status !== "pending" || friendship.addressee !== addressee) {
      return false;
    }
    friendship.status = "accepted";
    return true;
  }

  public async remove(a: string, b: string): Promise<void> {
    this.friendships.delete(pairKey(a, b));
  }

  public async listFor(userId: string): Promise<Friendship[]> {
    return [...this.friendships.values()].filter((f) => f.requester === userId || f.addressee === userId).map((f) => ({ ...f }));
  }

  public async areFriends(a: string, b: string): Promise<boolean> {
    return this.friendships.get(pairKey(a, b))?.status === "accepted";
  }

  public async removeAllFor(userId: string): Promise<void> {
    for (const [key, f] of this.friendships) {
      if (f.requester === userId || f.addressee === userId) this.friendships.delete(key);
    }
  }
}
