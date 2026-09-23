import { log } from "../logger";
import type { FriendStore } from "../store/friends";
import type { Kv } from "../store/kv";

export type PresenceStatus = "online" | "in_game" | "offline";
export type Notifier = (userId: string, event: string, payload: unknown) => void;

const PRESENCE_TTL_SECONDS = 120;
const REFRESH_MS = 60_000;

/**
 * Présence des comptes : état local (sockets de cette instance) recopié dans Redis avec un
 * TTL, pour qu'une future deuxième instance voie aussi qui est en ligne.
 */
export class PresenceService {
  private readonly sockets = new Map<string, Set<string>>();
  private readonly inGame = new Set<string>();
  private readonly timer: NodeJS.Timeout;

  public constructor(
    private readonly kv: Kv,
    private readonly friends: FriendStore,
    private readonly notify: Notifier,
  ) {
    this.timer = setInterval(() => void this.refreshAll(), REFRESH_MS);
    this.timer.unref();
  }

  public connect(userId: string, socketId: string): void {
    const set = this.sockets.get(userId) ?? new Set<string>();
    const wasOffline = set.size === 0;
    set.add(socketId);
    this.sockets.set(userId, set);
    if (wasOffline) {
      void this.publish(userId);
    }
  }

  public disconnect(userId: string, socketId: string): void {
    const set = this.sockets.get(userId);
    if (set === undefined) {
      return;
    }
    set.delete(socketId);
    if (set.size === 0) {
      this.sockets.delete(userId);
      this.inGame.delete(userId);
      void this.publish(userId);
    }
  }

  public setInGame(userIds: string[], inGame: boolean): void {
    for (const userId of userIds) {
      const changed = inGame ? !this.inGame.has(userId) : this.inGame.has(userId);
      if (inGame) this.inGame.add(userId);
      else this.inGame.delete(userId);
      if (changed) {
        void this.publish(userId);
      }
    }
  }

  public localStatus(userId: string): PresenceStatus {
    if (!this.sockets.has(userId)) return "offline";
    return this.inGame.has(userId) ? "in_game" : "online";
  }

  public async status(userId: string): Promise<PresenceStatus> {
    const local = this.localStatus(userId);
    if (local !== "offline") {
      return local;
    }
    try {
      const stored = await this.kv.get(`presence:${userId}`);
      return stored === "online" || stored === "in_game" ? stored : "offline";
    } catch {
      return "offline";
    }
  }

  public isOnline(userId: string): boolean {
    return this.sockets.has(userId);
  }

  public stop(): void {
    clearInterval(this.timer);
  }

  private async publish(userId: string): Promise<void> {
    const status = this.localStatus(userId);
    try {
      if (status === "offline") {
        await this.kv.del(`presence:${userId}`);
      } else {
        await this.kv.set(`presence:${userId}`, status, PRESENCE_TTL_SECONDS);
      }
      for (const friendship of await this.friends.listFor(userId)) {
        if (friendship.status === "accepted") {
          const friendId = friendship.requester === userId ? friendship.addressee : friendship.requester;
          this.notify(friendId, "friend_presence", { userId, status });
        }
      }
    } catch (error) {
      log.warn("presence update failed", { error });
    }
  }

  private async refreshAll(): Promise<void> {
    for (const userId of this.sockets.keys()) {
      try {
        await this.kv.set(`presence:${userId}`, this.localStatus(userId), PRESENCE_TTL_SECONDS);
      } catch {
        return;
      }
    }
  }
}
