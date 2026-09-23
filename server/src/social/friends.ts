import { ApiError, parseDisplayName } from "../auth/accounts";
import { allow } from "../auth/rateLimit";
import type { FriendStore } from "../store/friends";
import type { Kv } from "../store/kv";
import type { UserStats, UserStore } from "../store/users";
import type { Notifier, PresenceService, PresenceStatus } from "./presence";

export type FriendEntry = { userId: string; displayName: string; status: PresenceStatus };
export type FriendRequestEntry = { userId: string; displayName: string; createdAt: string };
export type FriendsView = { friends: FriendEntry[]; incoming: FriendRequestEntry[]; outgoing: FriendRequestEntry[] };

export class FriendService {
  public constructor(
    private readonly users: UserStore,
    private readonly friends: FriendStore,
    private readonly presence: PresenceService,
    private readonly kv: Kv,
    private readonly notify: Notifier,
  ) {}

  public async list(userId: string): Promise<FriendsView> {
    const friendships = await this.friends.listFor(userId);
    const otherIds = friendships.map((f) => (f.requester === userId ? f.addressee : f.requester));
    const names = new Map((await this.users.findManyByIds(otherIds)).map((user) => [user.id, user.displayName ?? "?"]));
    const view: FriendsView = { friends: [], incoming: [], outgoing: [] };
    for (const friendship of friendships) {
      const otherId = friendship.requester === userId ? friendship.addressee : friendship.requester;
      const displayName = names.get(otherId);
      if (displayName === undefined) {
        continue;
      }
      if (friendship.status === "accepted") {
        view.friends.push({ userId: otherId, displayName, status: await this.presence.status(otherId) });
      } else {
        const entry = { userId: otherId, displayName, createdAt: friendship.createdAt.toISOString() };
        (friendship.requester === userId ? view.outgoing : view.incoming).push(entry);
      }
    }
    view.friends.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return view;
  }

  public async request(userId: string, rawDisplayName: unknown): Promise<"pending" | "accepted"> {
    const displayName = parseDisplayName(rawDisplayName);
    if (!(await allow(this.kv, "friend-request", userId, 30, 3600))) {
      throw new ApiError(429, "too_many_requests");
    }
    const target = await this.users.findByDisplayName(displayName);
    if (target === null || !target.emailVerified) {
      throw new ApiError(404, "user_not_found");
    }
    if (target.id === userId) {
      throw new ApiError(400, "cannot_friend_self");
    }
    const friendship = await this.friends.request(userId, target.id);
    this.notify(target.id, friendship.status === "accepted" ? "friends_changed" : "friend_request", {});
    this.notify(userId, "friends_changed", {});
    return friendship.status;
  }

  public async accept(userId: string, requesterId: string): Promise<void> {
    if (!(await this.friends.accept(userId, requesterId))) {
      throw new ApiError(404, "request_not_found");
    }
    this.notify(requesterId, "friends_changed", {});
    this.notify(userId, "friends_changed", {});
  }

  /** Refuser une demande, annuler la sienne ou retirer un ami. */
  public async remove(userId: string, otherId: string): Promise<void> {
    await this.friends.remove(userId, otherId);
    this.notify(otherId, "friends_changed", {});
    this.notify(userId, "friends_changed", {});
  }

  /** Classement : soi-même et ses amis acceptés, par victoires puis taux de victoire. */
  public async leaderboard(userId: string): Promise<Array<{ userId: string; displayName: string; stats: UserStats; self: boolean }>> {
    const friendships = await this.friends.listFor(userId);
    const ids = [userId, ...friendships.filter((f) => f.status === "accepted").map((f) => (f.requester === userId ? f.addressee : f.requester))];
    const users = await this.users.findManyByIds(ids);
    const rate = (stats: { wins: number; losses: number }) => (stats.wins + stats.losses === 0 ? 0 : stats.wins / (stats.wins + stats.losses));
    return users
      .map((user) => ({ userId: user.id, displayName: user.displayName ?? "?", stats: user.stats, self: user.id === userId }))
      .sort((a, b) => b.stats.wins - a.stats.wins || rate(b.stats) - rate(a.stats) || a.displayName.localeCompare(b.displayName));
  }

  public areFriends(a: string, b: string): Promise<boolean> {
    return this.friends.areFriends(a, b);
  }
}
