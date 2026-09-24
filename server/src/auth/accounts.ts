import type { FriendStore } from "../store/friends";
import type { GameLogStore } from "../store/gamelog";
import crypto from "crypto";

import type { Kv } from "../store/kv";
import { DuplicateError } from "../store/users";
import type { User, UserStore } from "../store/users";
import { parsePseudo } from "../validation";
import type { EmailCodeService } from "./codes";
import type { GoogleIdentity } from "./google";
import { codeMail } from "./mailer";
import type { Mailer } from "./mailer";
import { dummyVerify, hashPassword, verifyPassword } from "./passwords";
import { allow } from "./rateLimit";
import type { SessionService } from "./sessions";

/** Erreur d'API : `code` stable (traduit côté client), statut HTTP. */

type PendingRegistration = { email: string; passwordHash: string; displayName: string };
/** Durée de vie d'une inscription en attente, alignée sur celle du code. */
export const PENDING_REGISTRATION_SECONDS = 15 * 60;

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

export type AccountDeps = {
  users: UserStore;
  friends: FriendStore;
  gameLogs: GameLogStore;
  kv: Kv;
  sessions: SessionService;
  codes: EmailCodeService;
  mailer: Mailer;
};

/** Vue d'un compte renvoyée au client. L'email n'est montré qu'à son propriétaire. */
export type AccountView = {
  id: string;
  displayName: string | null;
  createdAt: string;
  stats: User["stats"];
  email?: string | null;
  hasPassword?: boolean;
  hasGoogle?: boolean;
  isAdmin?: boolean;
  isModerator?: boolean;
  totpEnabled?: boolean;
  /** Avertissements de modération pas encore lus (visibles par le joueur lui-même). */
  pendingWarnings?: Array<{ id: string; at: string; reason: string }>;
  /** Chat coupé jusqu'à cette date (mute ou ban du chat). */
  chatMutedUntil?: string | null;
};

// Caractères usuels seulement : une adresse finit dans des emails HTML et dans l'interface admin,
// elle ne doit pas pouvoir y glisser de balises (« x@<a href=…>.fr »). Domaines accentués : punycode.
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/;

export function parseEmail(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 254 || !EMAIL_PATTERN.test(raw.trim())) {
    throw new ApiError(400, "invalid_email");
  }
  return raw.trim().toLowerCase();
}

export function parsePassword(raw: unknown): string {
  if (typeof raw !== "string" || raw.length < 10 || raw.length > 200) {
    throw new ApiError(400, "weak_password");
  }
  return raw;
}

export function parseDisplayName(raw: unknown): string {
  let name: string;
  try {
    name = parsePseudo(raw);
  } catch {
    throw new ApiError(400, "invalid_display_name");
  }
  if ([...name].length < 3) {
    throw new ApiError(400, "invalid_display_name");
  }
  return name;
}

function parseCode(raw: unknown): string {
  if (typeof raw !== "string" || !/^\d{6}$/.test(raw.trim())) {
    throw new ApiError(400, "invalid_code");
  }
  return raw.trim();
}

export function accountView(user: User, self: boolean): AccountView {
  const base: AccountView = { id: user.id, displayName: user.displayName, createdAt: user.createdAt.toISOString(), stats: { ...user.stats } };
  return self
    ? {
        ...base,
        email: user.email,
        hasPassword: user.passwordHash !== null,
        hasGoogle: user.googleSub !== null,
        isAdmin: user.role === "admin",
        isModerator: user.role === "moderator",
        totpEnabled: user.totpSecret !== null,
        chatMutedUntil: user.chatMutedUntil !== null && user.chatMutedUntil > new Date() ? user.chatMutedUntil.toISOString() : null,
        pendingWarnings: user.warnings.filter((warning) => warning.seenAt === null).map((warning) => ({ id: warning.id, at: warning.at.toISOString(), reason: warning.reason })),
      }
    : base;
}

export function isBanned(user: User, now = new Date()): boolean {
  return user.bannedUntil !== null && user.bannedUntil > now;
}

export class AccountService {
  public constructor(private readonly deps: AccountDeps) {}

  /**
   * Inscription en attente : rien n'est écrit sur un compte avant la validation du code. Les
   * identifiants choisis restent dans Redis, liés à un jeton que seul ce navigateur détient
   * (cookie) : quelqu'un qui connaît l'email ne peut pas y substituer son propre mot de passe.
   * Renvoie ce jeton.
   */
  public async register(input: { email: unknown; password: unknown; displayName: unknown }, ip: string): Promise<string> {
    const email = parseEmail(input.email);
    const password = parsePassword(input.password);
    const displayName = parseDisplayName(input.displayName);
    if (!(await allow(this.deps.kv, "register", ip, 10, 3600))) {
      throw new ApiError(429, "too_many_requests");
    }

    const existing = await this.deps.users.findByEmail(email);
    if (existing !== null && existing.emailVerified) {
      throw new ApiError(409, "email_taken");
    }
    const holder = await this.deps.users.findByDisplayName(displayName);
    if (holder !== null && holder.id !== existing?.id) {
      throw new ApiError(409, "display_name_taken");
    }
    const code = await this.deps.codes.issue("verify", email);
    if (code === null) {
      throw new ApiError(429, "code_cooldown");
    }
    const token = crypto.randomBytes(32).toString("base64url");
    const pending: PendingRegistration = { email, passwordHash: await hashPassword(password), displayName };
    await this.deps.kv.set(`regpending:${token}`, JSON.stringify(pending), PENDING_REGISTRATION_SECONDS);
    await this.deps.mailer.send(codeMail(email, "verify", code));
    return token;
  }

  public async resendVerification(rawEmail: unknown): Promise<void> {
    const email = parseEmail(rawEmail);
    const user = await this.deps.users.findByEmail(email);
    if (user !== null && !user.emailVerified) {
      await this.sendCode("verify", email, false);
    }
  }

  public async verifyEmail(rawEmail: unknown, rawCode: unknown, pendingToken?: string): Promise<User> {
    const email = parseEmail(rawEmail);
    const code = parseCode(rawCode);
    // Le code d'abord, pour tout le monde : la réponse ne dit pas si l'email a un compte.
    await this.checkCode("verify", email, code);
    const pending = await this.takePending(pendingToken, email);
    const user = await this.deps.users.findByEmail(email);
    if (pending !== null) {
      try {
        if (user === null) {
          return await this.deps.users.create({ email, emailVerified: true, passwordHash: pending.passwordHash, googleSub: null, displayName: pending.displayName });
        }
        if (user.emailVerified) {
          throw new ApiError(409, "email_taken");
        }
        // Compte jamais validé (créé avant ce correctif, ou par quelqu'un d'autre) : le détenteur
        // du code impose ses identifiants.
        return (await this.deps.users.update(user.id, { passwordHash: pending.passwordHash, displayName: pending.displayName, emailVerified: true })) as User;
      } catch (error) {
        if (error instanceof DuplicateError) {
          throw new ApiError(409, error.field === "displayName" ? "display_name_taken" : "email_taken");
        }
        throw error;
      }
    }
    if (user === null || user.emailVerified) {
      throw new ApiError(400, "invalid_code");
    }
    return (await this.deps.users.update(user.id, { emailVerified: true })) as User;
  }

  public async login(input: { email: unknown; password: unknown }, ip: string): Promise<User> {
    const email = parseEmail(input.email);
    const password = typeof input.password === "string" ? input.password.slice(0, 200) : "";
    // Limite par email indépendante de l'IP : changer d'adresse ne donne pas d'essais en plus.
    if (
      !(await allow(this.deps.kv, "login", `${ip}:${email}`, 10, 900)) ||
      !(await allow(this.deps.kv, "login-ip", ip, 50, 900)) ||
      !(await allow(this.deps.kv, "login-email", email, 30, 900))
    ) {
      throw new ApiError(429, "too_many_requests");
    }
    const user = await this.deps.users.findByEmail(email);
    if (user === null || user.passwordHash === null) {
      await dummyVerify(password);
      throw new ApiError(401, "invalid_credentials");
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new ApiError(401, "invalid_credentials");
    }
    if (isBanned(user)) {
      throw new ApiError(403, "banned");
    }
    if (!user.emailVerified) {
      await this.sendCode("verify", email, false);
      throw new ApiError(403, "email_not_verified");
    }
    return user;
  }

  /** Répond toujours de la même façon : ne révèle pas si l'email a un compte. */
  public async requestPasswordReset(rawEmail: unknown): Promise<void> {
    const email = parseEmail(rawEmail);
    const user = await this.deps.users.findByEmail(email);
    if (user !== null) {
      // Sans attendre l'envoi : le temps de réponse ne révèle pas si l'email a un compte.
      this.sendCode("reset", email, false).catch(() => undefined);
    }
  }

  public async resetPassword(input: { email: unknown; code: unknown; password: unknown }): Promise<User> {
    const email = parseEmail(input.email);
    const code = parseCode(input.code);
    const password = parsePassword(input.password);
    await this.checkCode("reset", email, code);
    const user = await this.deps.users.findByEmail(email);
    if (user === null) {
      throw new ApiError(400, "invalid_code");
    }
    await this.deps.sessions.destroyAll(user.id);
    // Recevoir le code prouve aussi la possession de la boîte mail.
    return (await this.deps.users.update(user.id, { passwordHash: await hashPassword(password), emailVerified: true })) as User;
  }

  public async loginWithGoogle(identity: GoogleIdentity): Promise<User> {
    if (!identity.emailVerified) {
      throw new ApiError(403, "google_email_not_verified");
    }
    const bySub = await this.deps.users.findByGoogleSub(identity.sub);
    const user = bySub ?? (await this.linkOrCreateGoogleUser(identity));
    // Le compte admin ne se connecte jamais via Google : mot de passe + TOTP uniquement.
    if (user.role === "admin") {
      throw new ApiError(403, "admin_password_only");
    }
    if (isBanned(user)) {
      throw new ApiError(403, "banned");
    }
    return user;
  }

  public async setDisplayName(userId: string, raw: unknown): Promise<User> {
    const displayName = parseDisplayName(raw);
    try {
      const user = await this.deps.users.update(userId, { displayName });
      if (user === null) {
        throw new ApiError(404, "not_found");
      }
      return user;
    } catch (error) {
      if (error instanceof DuplicateError) {
        throw new ApiError(409, "display_name_taken");
      }
      throw error;
    }
  }

  /** Suppression RGPD : compte, amitiés et sessions ; les logs perdent le lien vers le compte. */
  public async deleteAccount(userId: string): Promise<void> {
    await this.deps.friends.removeAllFor(userId);
    await this.deps.gameLogs.detachUser(userId);
    await this.deps.sessions.destroyAll(userId);
    await this.deps.users.delete(userId);
  }

  /** Profil visible par son propriétaire et ses amis acceptés uniquement. */
  public async profile(viewerId: string, targetId: string): Promise<AccountView> {
    const target = await this.deps.users.findById(targetId);
    if (target === null) {
      throw new ApiError(404, "not_found");
    }
    if (viewerId !== targetId && !(await this.deps.friends.areFriends(viewerId, targetId))) {
      throw new ApiError(403, "forbidden");
    }
    return accountView(target, viewerId === targetId);
  }

  private async linkOrCreateGoogleUser(identity: GoogleIdentity): Promise<User> {
    const byEmail = await this.deps.users.findByEmail(identity.email);
    if (byEmail !== null && byEmail.role === "admin") {
      throw new ApiError(403, "admin_password_only");
    }
    if (byEmail !== null) {
      // Google prouve la possession de l'email. Un compte jamais validé a pu être créé par
      // quelqu'un d'autre avec cet email : son mot de passe est alors effacé.
      return (await this.deps.users.update(byEmail.id, {
        googleSub: identity.sub,
        emailVerified: true,
        ...(byEmail.emailVerified ? {} : { passwordHash: null }),
      })) as User;
    }
    return this.deps.users.create({ email: identity.email, emailVerified: true, passwordHash: null, googleSub: identity.sub, displayName: null });
  }

  private async takePending(token: string | undefined, email: string): Promise<PendingRegistration | null> {
    if (token === undefined || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
    const raw = await this.deps.kv.get(`regpending:${token}`);
    if (raw === null) return null;
    const pending = JSON.parse(raw) as PendingRegistration;
    if (pending.email !== email) return null;
    await this.deps.kv.del(`regpending:${token}`);
    return pending;
  }

  private async sendCode(purpose: "verify" | "reset", email: string, failOnCooldown: boolean): Promise<void> {
    const code = await this.deps.codes.issue(purpose, email);
    if (code === null) {
      if (failOnCooldown) {
        throw new ApiError(429, "code_cooldown");
      }
      return;
    }
    await this.deps.mailer.send(codeMail(email, purpose, code));
  }

  private async checkCode(purpose: "verify" | "reset", email: string, code: string): Promise<void> {
    const result = await this.deps.codes.check(purpose, email, code);
    if (result === "expired") throw new ApiError(400, "code_expired");
    if (result === "too_many_attempts") throw new ApiError(429, "code_too_many_attempts");
    if (result === "invalid") throw new ApiError(400, "invalid_code");
  }
}
