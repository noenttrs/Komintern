import crypto from "crypto";

import type { Collection, Db } from "mongodb";

export type ContactMessage = {
  id: string;
  createdAt: Date;
  email: string;
  subject: string;
  message: string;
  userId: string | null;
  read: boolean;
};

export interface ContactStore {
  create(input: Omit<ContactMessage, "id" | "createdAt" | "read">): Promise<ContactMessage>;
  list(limit?: number): Promise<ContactMessage[]>;
  markRead(id: string, read: boolean): Promise<boolean>;
  countUnread(): Promise<number>;
}

type ContactDoc = Omit<ContactMessage, "id"> & { _id: string };

const newId = (): string => `c_${crypto.randomBytes(8).toString("hex")}`;
const fromDoc = ({ _id, ...rest }: ContactDoc): ContactMessage => ({ id: _id, ...rest });

export class MongoContactStore implements ContactStore {
  private readonly messages: Collection<ContactDoc>;

  public constructor(db: Db) {
    this.messages = db.collection<ContactDoc>("contact_messages");
  }

  public async ensureIndexes(): Promise<void> {
    await this.messages.createIndex({ createdAt: -1 });
    // Conservation limitée (mentions légales) : 3 ans.
    await this.messages.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3 * 365 * 24 * 3600, name: "ttl_3y" });
  }

  public async create(input: Omit<ContactMessage, "id" | "createdAt" | "read">): Promise<ContactMessage> {
    const doc: ContactDoc = { _id: newId(), createdAt: new Date(), read: false, ...input };
    await this.messages.insertOne(doc);
    return fromDoc(doc);
  }

  public async list(limit = 200): Promise<ContactMessage[]> {
    return (await this.messages.find().sort({ createdAt: -1 }).limit(limit).toArray()).map(fromDoc);
  }

  public async markRead(id: string, read: boolean): Promise<boolean> {
    return (await this.messages.updateOne({ _id: id }, { $set: { read } })).matchedCount === 1;
  }

  public async countUnread(): Promise<number> {
    return this.messages.countDocuments({ read: false });
  }
}

export class MemoryContactStore implements ContactStore {
  public readonly messages: ContactMessage[] = [];

  public async create(input: Omit<ContactMessage, "id" | "createdAt" | "read">): Promise<ContactMessage> {
    const message = { id: newId(), createdAt: new Date(), read: false, ...input };
    this.messages.unshift(message);
    return { ...message };
  }

  public async list(limit = 200): Promise<ContactMessage[]> {
    return this.messages.slice(0, limit).map((message) => ({ ...message }));
  }

  public async markRead(id: string, read: boolean): Promise<boolean> {
    const message = this.messages.find((entry) => entry.id === id);
    if (message === undefined) return false;
    message.read = read;
    return true;
  }

  public async countUnread(): Promise<number> {
    return this.messages.filter((message) => !message.read).length;
  }
}
