import path from "path";

import { MongoClient } from "mongodb";

import { AccountService } from "./auth/accounts";
import { EmailCodeService } from "./auth/codes";
import { GoogleOAuth } from "./auth/google";
import { PushService } from "./push/push";
import { LogMailer, ResendMailer } from "./auth/mailer";
import type { Mailer } from "./auth/mailer";
import { AccountSecurity } from "./auth/security";
import { SessionService } from "./auth/sessions";
import type { Config } from "./config";
import { log } from "./logger";
import { loadWordList } from "./moderation/filter";
import type { WordList } from "./moderation/filter";
import { ModerationService } from "./moderation/service";
import type { RecordedGame } from "./RoomManager";
import { FriendService } from "./social/friends";
import { PresenceService } from "./social/presence";
import type { Notifier } from "./social/presence";
import { ContactService } from "./admin/service";
import { Audience } from "./analytics/audience";
import { MemoryContactStore, MongoContactStore } from "./store/contact";
import type { ContactStore } from "./store/contact";
import { MemoryFriendStore, MongoFriendStore } from "./store/friends";
import type { FriendStore } from "./store/friends";
import { MemoryGameLogStore, MongoGameLogStore } from "./store/gamelog";
import type { GameLog, GameLogStore } from "./store/gamelog";
import { MemoryKv, RedisKv } from "./store/kv";
import type { Kv } from "./store/kv";
import { MemoryUserStore, MongoUserStore } from "./store/users";
import type { UserStore } from "./store/users";

export type Stores = { kv: Kv; users: UserStore; friends: FriendStore; gameLogs: GameLogStore; contact: ContactStore; mailer: Mailer };

export type Services = Stores & {
  config: Config;
  sessions: SessionService;
  codes: EmailCodeService;
  accounts: AccountService;
  security: AccountSecurity;
  audience: Audience;
  friendService: FriendService;
  presence: PresenceService;
  moderation: ModerationService;
  contactService: ContactService;
  wordList: WordList;
  google?: GoogleOAuth;
  push: PushService;
  recordGame: (game: RecordedGame) => Promise<void>;
  close: () => Promise<void>;
};

const ANONYMIZE_EVERY_MS = 24 * 3600 * 1000;

/** Stores réels : Mongo (deux utilisateurs séparés) et Redis. Les connexions sont paresseuses. */
export function createStores(config: Config): { stores: Stores; ready: Promise<void>; close: () => Promise<void> } {
  if (config.mongoAppUrl === undefined || config.mongoLogUrl === undefined || config.redisUrl === undefined) {
    log.warn("MONGO_APP_URL, MONGO_LOG_URL or REDIS_URL missing: accounts use in-memory storage (data lost on restart)");
    return { stores: memoryStores(new LogMailer()), ready: Promise.resolve(), close: async () => undefined };
  }
  const clientOptions = { serverSelectionTimeoutMS: 3_000, connectTimeoutMS: 3_000 };
  const appClient = new MongoClient(config.mongoAppUrl, clientOptions);
  const logClient = new MongoClient(config.mongoLogUrl, clientOptions);
  const users = new MongoUserStore(appClient.db());
  const friends = new MongoFriendStore(appClient.db());
  const gameLogs = new MongoGameLogStore(logClient.db());
  const contact = new MongoContactStore(appClient.db());
  const kv = new RedisKv(config.redisUrl);
  const mailer = config.resendApiKey === undefined ? new LogMailer() : new ResendMailer(config.resendApiKey, config.emailFrom);

  // Index créés en arrière-plan, avec nouvelles tentatives si Mongo démarre après nous.
  const ready = (async () => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await Promise.all([users.ensureIndexes(), friends.ensureIndexes(), gameLogs.ensureIndexes(), contact.ensureIndexes()]);
        log.info("mongo ready");
        return;
      } catch (error) {
        log.warn("mongo not ready, retrying", { attempt, message: error instanceof Error ? error.message : String(error) });
        await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, attempt * 2_000)).unref());
      }
    }
  })();

  return {
    stores: { kv, users, friends, gameLogs, contact, mailer },
    ready,
    close: async () => {
      await Promise.allSettled([appClient.close(), logClient.close(), kv.close()]);
    },
  };
}

export function memoryStores(mailer: Mailer): Stores {
  return {
    kv: new MemoryKv(),
    users: new MemoryUserStore(),
    friends: new MemoryFriendStore(),
    gameLogs: new MemoryGameLogStore(),
    contact: new MemoryContactStore(),
    mailer,
  };
}

export function createServices(config: Config, stores: Stores, notify: Notifier, closeStores: () => Promise<void> = async () => undefined): Services {
  const sessions = new SessionService(stores.kv);
  const codes = new EmailCodeService(stores.kv);
  const presence = new PresenceService(stores.kv, stores.friends, notify);
  const moderation = new ModerationService(stores.gameLogs);
  const wordList = loadWordList(path.resolve(__dirname, "../moderation/flagged-words.txt"));

  const recordGame = async (game: RecordedGame): Promise<void> => {
    const winner = game.summary.gameOver?.winner ?? null;
    const players = game.players.map((player) => ({ ...player, faction: game.summary.roleMap[player.playerId] ?? null }));
    const entry: GameLog = {
      id: game.gameId,
      roomCode: game.roomCode,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      outcome: game.outcome,
      ruleset: game.ruleset,
      players,
      turnOrder: game.summary.turnOrder,
      confidenceHistory: game.summary.confidenceHistory,
      missionHistory: game.summary.missionHistory,
      scores: game.summary.scores,
      winner,
      reason: game.summary.gameOver?.reason ?? null,
      forfeitedBy: game.summary.gameOver?.forfeitedBy ?? null,
      chat: game.chat,
      anonymizedAt: null,
    };
    await stores.gameLogs.insertGame(entry);

    // Seules les parties menées à leur terme comptent dans les stats des comptes.
    if (game.outcome !== "finished" || winner === null) {
      return;
    }
    for (const player of players) {
      if (player.userId !== null && player.faction !== null) {
        await stores.users.recordGameResult(player.userId, { won: player.faction === winner, faction: player.faction });
      }
    }
  };

  // Anonymisation des logs de plus de N jours, sauf ceux liés à un dossier de modération ouvert.
  const anonymize = async (): Promise<void> => {
    try {
      if (!(await stores.kv.setIfAbsent("job:anonymize", "1", 3600))) {
        return;
      }
      const before = new Date(Date.now() - config.logRetentionAnonymizeDays * 24 * 3600 * 1000);
      const count = await stores.gameLogs.anonymizeGamesBefore(before, await stores.gameLogs.openCaseGameIds());
      if (count > 0) {
        log.info("game logs anonymized", { count });
      }
    } catch (error) {
      log.warn("anonymization job failed", { error });
    }
  };
  const firstRun = setTimeout(() => void anonymize(), 60_000);
  firstRun.unref();
  const daily = setInterval(() => void anonymize(), ANONYMIZE_EVERY_MS);
  daily.unref();

  return {
    ...stores,
    config,
    sessions,
    codes,
    accounts: new AccountService({ ...stores, sessions, codes }),
    security: new AccountSecurity(stores.users, stores.kv, codes, stores.mailer),
    audience: new Audience(stores.kv),
    friendService: new FriendService(stores.users, stores.friends, presence, stores.kv, notify),
    presence,
    moderation,
    contactService: new ContactService(stores.contact, stores.mailer, stores.kv, config.legal.contactEmail),
    wordList,
    google:
      config.google === undefined
        ? undefined
        : new GoogleOAuth(config.google.clientId, config.google.clientSecret, `${config.publicUrl}/api/auth/google/callback`, stores.kv),
    push: new PushService(config.vapid),
    recordGame,
    close: async () => {
      clearTimeout(firstRun);
      clearInterval(daily);
      presence.stop();
      await closeStores();
    },
  };
}
