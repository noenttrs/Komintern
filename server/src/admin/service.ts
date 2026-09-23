import { ApiError, parseEmail } from "../auth/accounts";
import type { Mailer } from "../auth/mailer";
import { allow } from "../auth/rateLimit";
import { verifyTotp } from "../auth/totp";
import type { ContactStore } from "../store/contact";
import type { GameLogStore } from "../store/gamelog";
import type { Kv } from "../store/kv";
import type { UserStore } from "../store/users";

export type LiveStats = { rooms: number; players: number; connectedPlayers: number; gamesInProgress: number };

const ADMIN_SESSION_TTL_SECONDS = 12 * 3600;


/**
 * Administration : réservée aux comptes `role: "admin"` (attribué en ligne de commande), et
 * seulement après une double authentification TOTP rattachée à la session courante.
 */
export class AdminService {
  public constructor(
    private readonly users: UserStore,
    private readonly gameLogs: GameLogStore,
    private readonly contact: ContactStore,
    private readonly kv: Kv,
    private readonly liveStats: () => LiveStats,
    /** Bannissement : fermer les sessions et couper les connexions en cours du compte. */
    private readonly onBan: (userId: string) => Promise<void> = async () => undefined,
  ) {}

  public async isAdmin(userId: string | undefined): Promise<boolean> {
    if (userId === undefined) return false;
    return (await this.users.findById(userId))?.role === "admin";
  }

  public async isElevated(userId: string | undefined, sessionId: string | undefined): Promise<boolean> {
    if (userId === undefined || sessionId === undefined || !(await this.isAdmin(userId))) return false;
    return (await this.kv.get(`sessadm:${sessionId}`)) === userId;
  }

  /** Vérifie le code TOTP et élève la session courante (12 h). Un code ne sert qu'une fois. */
  public async elevate(userId: string, sessionId: string, rawCode: unknown): Promise<void> {
    const user = await this.users.findById(userId);
    if (user === null || user.role !== "admin" || user.totpSecret === null) {
      throw new ApiError(403, "forbidden");
    }
    if (!(await allow(this.kv, "totp", userId, 5, 900))) {
      throw new ApiError(429, "too_many_requests");
    }
    const code = typeof rawCode === "string" ? rawCode.trim() : "";
    const counter = verifyTotp(user.totpSecret, code);
    const last = Number((await this.kv.get(`totp:last:${userId}`)) ?? "-1");
    if (counter === null || counter <= last) {
      throw new ApiError(401, "invalid_totp");
    }
    await this.kv.set(`totp:last:${userId}`, String(counter), 300);
    await this.kv.set(`sessadm:${sessionId}`, userId, ADMIN_SESSION_TTL_SECONDS);
  }

  public async stats(): Promise<Record<string, unknown>> {
    const [users, games, unreadContact] = await Promise.all([this.users.countAll(), this.gameLogs.stats(), this.contact.countUnread()]);
    return { users, games, live: this.liveStats(), unreadContact };
  }

  public listReports(status: unknown) {
    return this.gameLogs.listCases(status === "open" || status === "resolved" ? status : undefined);
  }

  public async report(id: string) {
    const moderationCase = await this.gameLogs.getCase(id);
    if (moderationCase === null) throw new ApiError(404, "not_found");
    await this.gameLogs.audit({ caseId: id, action: "show", at: new Date(), detail: "admin web" });
    return { case: moderationCase, audit: await this.gameLogs.auditTrail(id) };
  }

  public async revealReport(id: string) {
    if ((await this.gameLogs.getCase(id)) === null) throw new ApiError(404, "not_found");
    await this.gameLogs.audit({ caseId: id, action: "reveal", at: new Date(), detail: "admin web" });
    const identities = await this.gameLogs.getIdentities(id);
    const accounts = await this.users.findManyByIds(identities.map((i) => i.userId).filter((u): u is string => u !== null));
    return identities.map((identity) => {
      const account = accounts.find((user) => user.id === identity.userId);
      return { ...identity, displayName: account?.displayName ?? null, email: account?.email ?? null, bannedUntil: account?.bannedUntil ?? null };
    });
  }

  public async resolveReport(id: string, rawNote: unknown): Promise<void> {
    const note = typeof rawNote === "string" && rawNote.trim() !== "" ? rawNote.trim().slice(0, 500) : "résolu";
    if (!(await this.gameLogs.resolveCase(id, note))) throw new ApiError(404, "not_found");
    await this.gameLogs.audit({ caseId: id, action: "resolve", at: new Date(), detail: note });
  }

  public async ban(userId: string, rawDays: unknown): Promise<Date | null> {
    const days = Number(rawDays);
    if (!Number.isFinite(days) || days < 0 || days > 3650) throw new ApiError(400, "invalid_input");
    const target = await this.users.findById(userId);
    if (target === null) throw new ApiError(404, "not_found");
    if (target.role === "admin") throw new ApiError(400, "invalid_input");
    const until = days === 0 ? null : new Date(Date.now() + days * 24 * 3600 * 1000);
    await this.users.update(userId, { bannedUntil: until });
    if (until !== null) await this.onBan(userId);
    return until;
  }

  public listContact() {
    return this.contact.list();
  }

  public async markContact(id: string, read: unknown): Promise<void> {
    if (!(await this.contact.markRead(id, read !== false))) throw new ApiError(404, "not_found");
  }
}

/** Formulaire de contact public : message stocké, puis transféré à la boîte de contact. */
export class ContactService {
  public constructor(
    private readonly contact: ContactStore,
    private readonly mailer: Mailer,
    private readonly kv: Kv,
    private readonly contactEmail: string,
  ) {}

  public async submit(input: { email: unknown; subject: unknown; message: unknown }, userId: string | null, ip: string): Promise<void> {
    const email = parseEmail(input.email);
    const subject = typeof input.subject === "string" ? input.subject.replace(/\s+/g, " ").trim() : "";
    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (subject.length < 1 || subject.length > 120 || message.length < 10 || message.length > 5000) {
      throw new ApiError(400, "invalid_contact");
    }
    if (!(await allow(this.kv, "contact", ip, 5, 3600))) {
      throw new ApiError(429, "too_many_requests");
    }
    const saved = await this.contact.create({ email, subject, message, userId });
    if (this.contactEmail !== "") {
      await this.mailer
        .send({
          to: this.contactEmail,
          replyTo: email,
          subject: `[Contact] ${subject}`,
          text: `De : ${email}${userId === null ? "" : ` (compte ${userId})`}\nMessage ${saved.id}\n\n${message}`,
          html: `<p>De : ${escapeHtml(email)}${userId === null ? "" : ` (compte ${escapeHtml(userId)})`}<br>Message ${saved.id}</p><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message)}</pre>`,
        })
        .catch(() => undefined); // le message reste lisible dans la page admin
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}
