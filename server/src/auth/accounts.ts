import type { FriendStore } from "../store/friends";
import type { GameLogStore } from "../store/gamelog";
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
};

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

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
  return self ? { ...base, email: user.email, hasPassword: user.passwordHash !== null, hasGoogle: user.googleSub !== null } : base;
}

export function isBanned(user: User, now = new Date()): boolean {
  return user.bannedUntil !== null && user.bannedUntil > now;
}

export class AccountService {
  public constructor(private readonly deps: AccountDeps) {}

  public async register(input: { email: unknown; password: unknown; displayName: unknown }, ip: string): Promise<void> {
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
    const passwordHash = await hashPassword(password);
    try {
      if (existing === null) {
        await this.deps.users.create({ email, emailVerified: false, passwordHash, googleSub: null, displayName });
      } else {
        // Inscription jamais validée : on repart des nouvelles informations.
        await this.deps.users.update(existing.id, { passwordHash, displayName });
      }
    } catch (error) {
      if (error instanceof DuplicateError) {
        throw new ApiError(409, error.field === "displayName" ? "display_name_taken" : "email_taken");
      }
      throw error;
    }
    await this.sendCode("verify", email, true);
  }

  public async resendVerification(rawEmail: unknown): Promise<void> {
    const email = parseEmail(rawEmail);
    const user = await this.deps.users.findByEmail(email);
    if (user !== null && !user.emailVerified) {
      await this.sendCode("verify", email, false);
    }
  }

  public async verifyEmail(rawEmail: unknown, rawCode: unknown): Promise<User> {
    const email = parseEmail(rawEmail);
    const code = parseCode(rawCode);
    const user = await this.deps.users.findByEmail(email);
    if (user === null) {
      throw new ApiError(400, "invalid_code");
    }
    await this.checkCode("verify", email, code);
    return (await this.deps.users.update(user.id, { emailVerified: true })) as User;
  }

  public async login(input: { email: unknown; password: unknown }, ip: string): Promise<User> {
    const email = parseEmail(input.email);
    const password = typeof input.password === "string" ? input.password.slice(0, 200) : "";
    if (!(await allow(this.deps.kv, "login", `${ip}:${email}`, 10, 900)) || !(await allow(this.deps.kv, "login-ip", ip, 50, 900))) {
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
      await this.sendCode("reset", email, false);
    }
  }

  public async resetPassword(input: { email: unknown; code: unknown; password: unknown }): Promise<User> {
    const email = parseEmail(input.email);
    const code = parseCode(input.code);
    const password = parsePassword(input.password);
    const user = await this.deps.users.findByEmail(email);
    if (user === null) {
      throw new ApiError(400, "invalid_code");
    }
    await this.checkCode("reset", email, code);
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
