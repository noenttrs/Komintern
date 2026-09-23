import crypto from "crypto";

import type { Kv } from "../store/kv";

const SESSION_TTL_SECONDS = 30 * 24 * 3600;

/** Sessions opaques : l'id aléatoire du cookie ne contient rien, tout est dans Redis. */
export class SessionService {
  public constructor(private readonly kv: Kv) {}

  public async create(userId: string): Promise<string> {
    const id = crypto.randomBytes(32).toString("base64url");
    await this.kv.set(`sess:${id}`, userId, SESSION_TTL_SECONDS);
    await this.kv.sadd(`usess:${userId}`, id);
    return id;
  }

  /** Renvoie l'utilisateur de la session et prolonge sa durée de vie (expiration glissante). */
  public async resolve(id: string | undefined): Promise<string | null> {
    if (id === undefined || !/^[A-Za-z0-9_-]{20,100}$/.test(id)) {
      return null;
    }
    const userId = await this.kv.get(`sess:${id}`);
    if (userId !== null) {
      await this.kv.expire(`sess:${id}`, SESSION_TTL_SECONDS);
    }
    return userId;
  }

  public async destroy(id: string, userId?: string): Promise<void> {
    await this.kv.del(`sess:${id}`);
    if (userId !== undefined) {
      await this.kv.srem(`usess:${userId}`, id);
    }
  }

  /** Déconnecte partout (changement de mot de passe, suppression de compte). */
  public async destroyAll(userId: string): Promise<void> {
    for (const id of await this.kv.smembers(`usess:${userId}`)) {
      await this.kv.del(`sess:${id}`);
    }
    await this.kv.del(`usess:${userId}`);
  }

  public static readonly ttlSeconds = SESSION_TTL_SECONDS;
}
