import Redis from "ioredis";

import { log } from "../logger";

/** Stockage clé-valeur éphémère (sessions, codes, présence, limites de débit). */
export interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Pose la clé seulement si elle n'existe pas ; renvoie true si posée. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  /** Incrémente et pose le TTL au premier incrément ; renvoie la nouvelle valeur. */
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export class RedisKv implements Kv {
  private readonly client: Redis;

  public constructor(url: string) {
    // Pas de file d'attente hors ligne : si Redis tombe, les appels échouent vite
    // (les fonctions de compte renvoient 503) au lieu de bloquer les joueurs.
    this.client = new Redis(url, { enableOfflineQueue: false, maxRetriesPerRequest: 1, lazyConnect: false });
    this.client.on("error", (error: Error) => log.warn("redis error", { message: error.message }));
  }

  public get raw(): Redis {
    return this.client;
  }

  public async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds === undefined) {
      await this.client.set(key, value);
    } else {
      await this.client.set(key, value, "EX", ttlSeconds);
    }
  }

  public async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, value, "EX", ttlSeconds, "NX")) === "OK";
  }

  public async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  public async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  public async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const [[, count]] = (await this.client.multi().incr(key).expire(key, ttlSeconds, "NX").exec()) as [[unknown, number]];
    return count;
  }

  public async sadd(key: string, member: string): Promise<void> {
    await this.client.sadd(key, member);
  }

  public async srem(key: string, member: string): Promise<void> {
    await this.client.srem(key, member);
  }

  public async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  public async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    this.client.disconnect();
  }
}

/** Implémentation en mémoire (tests, ou dev sans Redis). */
export class MemoryKv implements Kv {
  private readonly values = new Map<string, { value: string; expiresAt: number | null }>();
  private readonly sets = new Map<string, Set<string>>();
  public now: () => number = () => Date.now();

  public async get(key: string): Promise<string | null> {
    const entry = this.values.get(key);
    if (entry === undefined) {
      return null;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.values.set(key, { value, expiresAt: ttlSeconds === undefined ? null : this.now() + ttlSeconds * 1000 });
  }

  public async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if ((await this.get(key)) !== null) {
      return false;
    }
    await this.set(key, value, ttlSeconds);
    return true;
  }

  public async del(key: string): Promise<void> {
    this.values.delete(key);
    this.sets.delete(key);
  }

  public async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.values.get(key);
    if (entry !== undefined) {
      entry.expiresAt = this.now() + ttlSeconds * 1000;
    }
  }

  public async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const current = await this.get(key);
    const next = (current === null ? 0 : Number(current)) + 1;
    const existing = this.values.get(key);
    this.values.set(key, {
      value: String(next),
      expiresAt: current === null || existing === undefined ? this.now() + ttlSeconds * 1000 : existing.expiresAt,
    });
    return next;
  }

  public async sadd(key: string, member: string): Promise<void> {
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(member);
    this.sets.set(key, set);
  }

  public async srem(key: string, member: string): Promise<void> {
    this.sets.get(key)?.delete(member);
  }

  public async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }

  public async ping(): Promise<boolean> {
    return true;
  }

  public async close(): Promise<void> {
    return;
  }
}
