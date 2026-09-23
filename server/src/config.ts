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
  logRetentionAnonymizeDays: number;
};

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
    legal: { editorName: optional(env.LEGAL_EDITOR_NAME) ?? "", contactEmail: optional(env.LEGAL_CONTACT_EMAIL) ?? "" },
    donationUrl: /^https:\/\/[^\s"<>]+$/.test(env.DONATION_URL ?? "") ? (env.DONATION_URL as string) : "",
    logRetentionAnonymizeDays: parsePositiveIntEnv(env.LOG_ANONYMIZE_AFTER_DAYS, 365),
  };
}
