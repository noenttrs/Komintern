// Appels HTTP vers /api : cookie de session httpOnly, erreurs traduites dans la langue courante.
import { translate, type TranslationKey } from "./i18n";

export class ApiRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(translateApiError(code));
    this.name = "ApiRequestError";
  }
}

/** Codes d'erreur de l'API (clés de traduction sous « api. »). */
const API_ERRORS = new Set<string>([
  "invalid_email",
  "weak_password",
  "invalid_display_name",
  "email_taken",
  "display_name_taken",
  "invalid_credentials",
  "email_not_verified",
  "invalid_code",
  "code_expired",
  "code_too_many_attempts",
  "code_cooldown",
  "too_many_requests",
  "banned",
  "google_email_not_verified",
  "unauthorized",
  "forbidden",
  "not_found",
  "user_not_found",
  "cannot_friend_self",
  "request_not_found",
  "bad_origin",
  "invalid_input",
  "unavailable",
  "network",
  "invalid_contact",
  "invalid_totp",
  "totp_required",
  "admin_password_only",
  "totp_challenge_expired",
  "totp_setup_expired",
  "totp_already_enabled",
  "admin_totp_required",
  "same_email",
]);

export function translateApiError(code: string): string {
  return translate(API_ERRORS.has(code) ? (`api.${code}` as TranslationKey) : "api.generic");
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: options.body === undefined ? {} : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiRequestError(0, "network");
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: { code?: string } };
  if (!response.ok) {
    throw new ApiRequestError(response.status, payload.error?.code ?? "unavailable");
  }
  return payload as T;
}

export type Stats = { wins: number; losses: number; gamesNazi: number; gamesCommunist: number; winsNazi?: number; winsCommunist?: number };

export type Account = {
  id: string;
  displayName: string | null;
  createdAt: string;
  stats: Stats;
  email?: string | null;
  hasPassword?: boolean;
  hasGoogle?: boolean;
  isAdmin?: boolean;
  totpEnabled?: boolean;
  pendingWarnings?: Array<{ id: string; at: string; reason: string }>;
};

export type PublicConfig = {
  googleEnabled: boolean;
  emailDelivery: boolean;
  legal: { editorName: string; contactEmail: string };
  donationUrl: string;
  /** Clé publique VAPID ; null : notifications désactivées sur ce serveur. */
  pushPublicKey?: string | null;
};

export type PresenceStatus = "online" | "in_game" | "offline";

export type FriendsView = {
  friends: Array<{ userId: string; displayName: string; status: PresenceStatus }>;
  incoming: Array<{ userId: string; displayName: string; createdAt: string }>;
  outgoing: Array<{ userId: string; displayName: string; createdAt: string }>;
};
