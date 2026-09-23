import crypto from "crypto";

import type { Kv } from "../store/kv";
import { DuplicateError } from "../store/users";
import type { User, UserStore } from "../store/users";
import { ApiError, parseEmail } from "./accounts";
import type { EmailCodeService } from "./codes";
import { codeMail, emailChangedMail } from "./mailer";
import type { Mailer } from "./mailer";
import { verifyPassword } from "./passwords";
import { allow } from "./rateLimit";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp";

const PENDING_TTL_SECONDS = 10 * 60;
const LOGIN_CHALLENGE_TTL_SECONDS = 5 * 60;

/**
 * Sécurité du compte : double authentification TOTP facultative (demandée à chaque connexion
 * une fois activée) et changement d'adresse email confirmé par un code.
 */
export class AccountSecurity {
  public constructor(
    private readonly users: UserStore,
    private readonly kv: Kv,
    private readonly codes: EmailCodeService,
    private readonly mailer: Mailer,
  ) {}

  // ---------------------------------------------------------------- double authentification

  /** Prépare l'activation : secret provisoire, confirmé par un premier code. */
  public async beginTotpSetup(userId: string): Promise<{ secret: string; uri: string }> {
    const user = await this.requireUser(userId);
    if (user.totpSecret !== null) throw new ApiError(409, "totp_already_enabled");
    const secret = generateTotpSecret();
    await this.kv.set(`totp:pending:${userId}`, secret, PENDING_TTL_SECONDS);
    return { secret, uri: otpauthUri(secret, user.email ?? user.displayName ?? user.id) };
  }

  public async confirmTotpSetup(userId: string, code: unknown): Promise<void> {
    const secret = await this.kv.get(`totp:pending:${userId}`);
    if (secret === null) throw new ApiError(400, "totp_setup_expired");
    await this.checkCode(userId, secret, code);
    await this.users.update(userId, { totpSecret: secret });
    await this.kv.del(`totp:pending:${userId}`);
  }

  public async disableTotp(userId: string, code: unknown): Promise<void> {
    const user = await this.requireUser(userId);
    if (user.role === "admin") throw new ApiError(400, "admin_totp_required");
    if (user.totpSecret === null) return;
    await this.checkCode(userId, user.totpSecret, code);
    await this.users.update(userId, { totpSecret: null });
  }

  /** Mot de passe correct mais 2FA active : on délivre un jeton court à échanger contre le code. */
  public needsTotp(user: User): boolean {
    // L'admin a sa propre étape TOTP à l'entrée de l'administration.
    return user.totpSecret !== null && user.role !== "admin";
  }

  public async createLoginChallenge(userId: string): Promise<string> {
    const token = crypto.randomBytes(24).toString("base64url");
    await this.kv.set(`login2fa:${token}`, userId, LOGIN_CHALLENGE_TTL_SECONDS);
    return token;
  }

  public async completeLoginChallenge(token: unknown, code: unknown): Promise<User> {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new ApiError(400, "invalid_totp");
    const userId = await this.kv.get(`login2fa:${token}`);
    if (userId === null) throw new ApiError(400, "totp_challenge_expired");
    const user = await this.requireUser(userId);
    if (user.totpSecret === null) throw new ApiError(400, "invalid_totp");
    await this.checkCode(userId, user.totpSecret, code);
    await this.kv.del(`login2fa:${token}`);
    return user;
  }

  // ---------------------------------------------------------------- changement d'email

  /** Envoie un code à la nouvelle adresse ; le mot de passe actuel est exigé s'il existe. */
  public async requestEmailChange(userId: string, input: { email: unknown; password: unknown }): Promise<void> {
    const user = await this.requireUser(userId);
    const email = parseEmail(input.email);
    if (email === user.email) throw new ApiError(400, "same_email");
    if (user.passwordHash !== null) {
      const password = typeof input.password === "string" ? input.password : "";
      if (!(await verifyPassword(user.passwordHash, password))) throw new ApiError(401, "invalid_credentials");
    }
    if (!(await allow(this.kv, "email-change", userId, 5, 3600))) throw new ApiError(429, "too_many_requests");
    const existing = await this.users.findByEmail(email);
    if (existing !== null) throw new ApiError(409, "email_taken");
    const code = await this.codes.issue("change", email);
    if (code === null) throw new ApiError(429, "code_cooldown");
    await this.kv.set(`emailchange:${userId}`, email, 15 * 60);
    await this.mailer.send(codeMail(email, "change", code));
  }

  public async confirmEmailChange(userId: string, rawCode: unknown): Promise<User> {
    const user = await this.requireUser(userId);
    const email = await this.kv.get(`emailchange:${userId}`);
    if (email === null) throw new ApiError(400, "code_expired");
    const code = typeof rawCode === "string" ? rawCode.trim() : "";
    const result = await this.codes.check("change", email, code);
    if (result === "expired") throw new ApiError(400, "code_expired");
    if (result === "too_many_attempts") throw new ApiError(429, "code_too_many_attempts");
    if (result === "invalid") throw new ApiError(400, "invalid_code");
    let updated: User | null;
    try {
      updated = await this.users.update(userId, { email, emailVerified: true });
    } catch (error) {
      if (error instanceof DuplicateError) throw new ApiError(409, "email_taken");
      throw error;
    }
    await this.kv.del(`emailchange:${userId}`);
    if (user.email !== null) {
      await this.mailer.send(emailChangedMail(user.email, email)).catch(() => undefined);
    }
    return updated as User;
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (user === null) throw new ApiError(401, "unauthorized");
    return user;
  }

  /** Code TOTP à usage unique, avec limite d'essais. */
  private async checkCode(userId: string, secret: string, rawCode: unknown): Promise<void> {
    if (!(await allow(this.kv, "totp", userId, 5, 900))) throw new ApiError(429, "too_many_requests");
    const code = typeof rawCode === "string" ? rawCode.trim() : "";
    const counter = verifyTotp(secret, code);
    const last = Number((await this.kv.get(`totp:last:${userId}`)) ?? "-1");
    if (counter === null || counter <= last) throw new ApiError(401, "invalid_totp");
    await this.kv.set(`totp:last:${userId}`, String(counter), 300);
  }

}
