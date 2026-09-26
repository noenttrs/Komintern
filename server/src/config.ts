import { parsePositiveIntEnv } from "./validation";

export type Config = {
  publicUrl: string;
  /** Origines autorisées pour les requêtes qui modifient des données (anti-CSRF). */
  trustedOrigins: string[];
  secureCookies: boolean;
  mongoAppUrl?: string;
  mongoLogUrl?: string;
  redisUrl?: string;
  socketRedisAdapter: boolean;
  resendApiKey?: string;
  emailFrom: string;
  google?: { clientId: string; clientSecret: string };
  legal: { editorName: string; contactEmail: string };
  donationUrl: string;
  /** Clés VAPID des notifications Web Push ; absentes : notifications désactivées. */
  vapid?: { publicKey: string; privateKey: string; subject: string };
  logRetentionAnonymizeDays: number;
  /**
   * Préfixe secret des rooms de test (tests automatiques contre le site en ligne) : leurs parties
   * ne sont pas enregistrées. 12 à 16 caractères, plus long qu'un code aléatoire (8) : impossible
   * à obtenir par hasard, et inconnu des joueurs (sinon ils pourraient échapper aux journaux).
   */
  testRoomPrefix: string | undefined;
};

/** Room de test : code « PREFIXE-… » (le préfixe vient de TEST_ROOM_PREFIX). */
export function isTestRoom(config: Pick<Config, "testRoomPrefix">, code: string): boolean {
  return config.testRoomPrefix !== undefined && code.startsWith(`${config.testRoomPrefix}-`);
}

function optional(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const publicUrl = (optional(env.PUBLIC_URL) ?? "http://localhost:8080").replace(/\/+$/, "");
  const extraOrigins = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry !== "*");
  const googleId = optional(env.GOOGLE_CLIENT_ID);
  const googleSecret = optional(env.GOOGLE_CLIENT_SECRET);
  const vapidPublic = optional(env.VAPID_PUBLIC_KEY);
  const vapidPrivate = optional(env.VAPID_PRIVATE_KEY);
  const contact = optional(env.LEGAL_CONTACT_EMAIL);

  return {
    publicUrl,
    trustedOrigins: [new URL(publicUrl).origin, ...extraOrigins],
    secureCookies: publicUrl.startsWith("https://"),
    mongoAppUrl: optional(env.MONGO_APP_URL),
    mongoLogUrl: optional(env.MONGO_LOG_URL),
    redisUrl: optional(env.REDIS_URL),
    socketRedisAdapter: env.SOCKET_REDIS_ADAPTER === "true",
    resendApiKey: optional(env.RESEND_API_KEY),
    emailFrom: optional(env.EMAIL_FROM) ?? "Nazi Communiste <noreply@localhost>",
    google: googleId !== undefined && googleSecret !== undefined ? { clientId: googleId, clientSecret: googleSecret } : undefined,
    legal: { editorName: optional(env.LEGAL_EDITOR_NAME) ?? "", contactEmail: contact ?? "" },
    donationUrl: /^https:\/\/[^\s"<>]+$/.test(env.DONATION_URL ?? "") ? (env.DONATION_URL as string) : "",
    vapid:
      vapidPublic !== undefined && vapidPrivate !== undefined
        ? { publicKey: vapidPublic, privateKey: vapidPrivate, subject: contact !== undefined ? `mailto:${contact}` : publicUrl }
        : undefined,
    logRetentionAnonymizeDays: parsePositiveIntEnv(env.LOG_ANONYMIZE_AFTER_DAYS, 365),
    testRoomPrefix: /^[A-Z0-9]{12,16}$/.test(env.TEST_ROOM_PREFIX ?? "") ? env.TEST_ROOM_PREFIX : undefined,
  };
}
