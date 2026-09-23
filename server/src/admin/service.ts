import { ApiError, parseEmail } from "../auth/accounts";
import type { Mailer } from "../auth/mailer";
import { allow } from "../auth/rateLimit";
import { verifyTotp } from "../auth/totp";
import type { ContactStore } from "../store/contact";
import type { GameLogStore } from "../store/gamelog";
import type { Kv } from "../store/kv";
import crypto from "crypto";

import { newSanctionId } from "../moderation/panel";
import type { AccountWarning, Sanction, StaffRole, User, UserStore } from "../store/users";

/** Membre de l'équipe qui agit : tracé dans le journal de modération. */
export type Staff = { id: string; name: string; role: StaffRole };

/** Durée maximale d'un bannissement décidé par un modérateur (au-delà : admin). */
const MODERATOR_MAX_BAN_DAYS = 30;
/** Ban définitif : date de fin symbolique, reconnue à l'affichage. */
export const PERMANENT_BAN_UNTIL = new Date("9999-12-31T00:00:00Z");

export type LiveStats = { rooms: number; players: number; connectedPlayers: number; gamesInProgress: number };

const ADMIN_SESSION_TTL_SECONDS = 12 * 3600;

/** Compte vu par l'administration (modération) : jamais le mot de passe ni le secret TOTP. */
export type AdminUserView = {
  id: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  bannedUntil: string | null;
  banReason: string | null;
  warnings: Array<{ id: string; at: string; reason: string; seen: boolean }>;
  gamesPlayed: number;
  role: StaffRole | null;
  permanentBan: boolean;
  chatMutedUntil: string | null;
  sanctions: Array<{ id: string; type: Sanction["type"]; at: string; until: string | null; reason: string; by: string; revoked: boolean }>;
};

function adminUserView(user: User): AdminUserView {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    bannedUntil: user.bannedUntil !== null && user.bannedUntil > new Date() ? user.bannedUntil.toISOString() : null,
    banReason: user.bannedUntil !== null && user.bannedUntil > new Date() ? user.banReason : null,
    warnings: user.warnings.map((warning) => ({ id: warning.id, at: warning.at.toISOString(), reason: warning.reason, seen: warning.seenAt !== null })),
    gamesPlayed: user.stats.wins + user.stats.losses,
    role: user.role,
    permanentBan: user.bannedUntil !== null && user.bannedUntil.getTime() >= PERMANENT_BAN_UNTIL.getTime(),
    chatMutedUntil: user.chatMutedUntil !== null && user.chatMutedUntil > new Date() ? user.chatMutedUntil.toISOString() : null,
    sanctions: user.sanctions.map((sanction) => ({
      id: sanction.id,
      type: sanction.type,
      at: sanction.at.toISOString(),
      until: sanction.until === null ? null : sanction.until.toISOString(),
      reason: sanction.reason,
      by: sanction.by,
      revoked: sanction.revokedAt !== null,
    })),
  };
}

function actorLabel(actor: Staff): string {
  return `${actor.name} (${actor.role === "admin" ? "admin" : "modérateur"})`;
}

function parseReason(raw: unknown, fallback: string): string {
  const reason = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  return reason === "" ? fallback : reason;
}


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
    /** Avertissement : prévenir le joueur tout de suite s'il est en ligne. */
    private readonly onWarn: (userId: string) => void = () => undefined,
  ) {}

  public async isAdmin(userId: string | undefined): Promise<boolean> {
    return (await this.staff(userId))?.role === "admin";
  }

  /** Admin ou modérateur ; null pour tout autre compte. */
  public async staff(userId: string | undefined): Promise<(Staff & { totpEnabled: boolean }) | null> {
    if (userId === undefined) return null;
    const user = await this.users.findById(userId);
    if (user === null || user.role === null) return null;
    return { id: user.id, name: user.displayName ?? user.email ?? user.id, role: user.role, totpEnabled: user.totpSecret !== null };
  }

  /** Membre de l'équipe dont la session a été élevée par un code TOTP, ou null. */
  public async elevatedStaff(userId: string | undefined, sessionId: string | undefined): Promise<Staff | null> {
    const member = await this.staff(userId);
    if (member === null || sessionId === undefined) return null;
    return (await this.kv.get(`sessadm:${sessionId}`)) === member.id ? { id: member.id, name: member.name, role: member.role } : null;
  }

  public async isElevated(userId: string | undefined, sessionId: string | undefined): Promise<boolean> {
    return (await this.elevatedStaff(userId, sessionId)) !== null;
  }

  /** Vérifie le code TOTP et élève la session courante (12 h). Un code ne sert qu'une fois. */
  public async elevate(userId: string, sessionId: string, rawCode: unknown): Promise<void> {
    const user = await this.users.findById(userId);
    if (user === null || user.role === null) {
      throw new ApiError(403, "forbidden");
    }
    // La double authentification est obligatoire pour l'équipe (levée d'anonymat, sanctions).
    if (user.totpSecret === null) {
      throw new ApiError(403, "totp_setup_required");
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

  public async report(id: string, actor: Staff) {
    const moderationCase = await this.gameLogs.getCase(id);
    if (moderationCase === null) throw new ApiError(404, "not_found");
    await this.gameLogs.audit({ caseId: id, action: "show", at: new Date(), actor: actorLabel(actor) });
    return { case: moderationCase, audit: await this.gameLogs.auditTrail(id) };
  }

  public async revealReport(id: string, actor: Staff) {
    if ((await this.gameLogs.getCase(id)) === null) throw new ApiError(404, "not_found");
    await this.gameLogs.audit({ caseId: id, action: "reveal", at: new Date(), actor: actorLabel(actor) });
    const identities = await this.gameLogs.getIdentities(id);
    const accounts = await this.users.findManyByIds(identities.map((i) => i.userId).filter((u): u is string => u !== null));
    return identities.map((identity) => {
      const account = accounts.find((user) => user.id === identity.userId);
      return { ...identity, displayName: account?.displayName ?? null, email: account?.email ?? null, bannedUntil: account?.bannedUntil ?? null };
    });
  }

  public async resolveReport(id: string, rawNote: unknown, actor: Staff): Promise<void> {
    const note = typeof rawNote === "string" && rawNote.trim() !== "" ? rawNote.trim().slice(0, 500) : "résolu";
    if (!(await this.gameLogs.resolveCase(id, note))) throw new ApiError(404, "not_found");
    await this.gameLogs.audit({ caseId: id, action: "resolve", at: new Date(), detail: note, actor: actorLabel(actor) });
  }

  public async ban(userId: string, rawDays: unknown, rawReason: unknown, actor: Staff): Promise<Date | null> {
    const days = Number(rawDays);
    if (!Number.isFinite(days) || days < 0 || days > 3650) throw new ApiError(400, "invalid_input");
    if (actor.role === "moderator" && days > MODERATOR_MAX_BAN_DAYS) throw new ApiError(403, "ban_too_long_for_moderator");
    const target = await this.requireTarget(userId, actor);
    const until = days === 0 ? null : new Date(Date.now() + days * 24 * 3600 * 1000);
    const reason = until === null ? null : parseReason(rawReason, "bannissement");
    const now = new Date();
    // Lever un bannissement abroge aussi un ban définitif.
    const sanctions: Sanction[] =
      until === null
        ? target.sanctions.map((sanction) => ((sanction.type === "ban" || sanction.type === "permanent_ban") && sanction.revokedAt === null ? { ...sanction, revokedAt: now } : sanction))
        : [...target.sanctions, { id: newSanctionId(), type: "ban", at: now, until, reason: reason as string, by: actorLabel(actor), caseId: null, revokedAt: null }];
    await this.users.update(userId, { bannedUntil: until, banReason: reason, sanctions: sanctions.slice(-100) });
    await this.gameLogs.audit({ caseId: `user:${target.id}`, action: until === null ? "unban" : "ban", at: new Date(), detail: until === null ? undefined : `${days} j · ${reason}`, actor: actorLabel(actor) });
    if (until !== null) await this.onBan(userId);
    return until;
  }

  public async warn(userId: string, rawReason: unknown, actor: Staff): Promise<AccountWarning> {
    const target = await this.requireTarget(userId, actor);
    const warning: AccountWarning = { id: `w_${crypto.randomBytes(6).toString("hex")}`, at: new Date(), reason: parseReason(rawReason, "") , seenAt: null };
    if (warning.reason === "") throw new ApiError(400, "invalid_input");
    await this.users.update(userId, { warnings: [...target.warnings, warning].slice(-50) });
    await this.gameLogs.audit({ caseId: `user:${target.id}`, action: "warn", at: warning.at, detail: warning.reason, actor: actorLabel(actor) });
    this.onWarn(userId);
    return warning;
  }

  public async removeWarning(userId: string, warningId: string, actor: Staff): Promise<void> {
    const target = await this.requireTarget(userId, actor);
    if (!target.warnings.some((warning) => warning.id === warningId)) throw new ApiError(404, "not_found");
    await this.users.update(userId, { warnings: target.warnings.filter((warning) => warning.id !== warningId) });
    await this.gameLogs.audit({ caseId: `user:${target.id}`, action: "remove_warning", at: new Date(), detail: warningId, actor: actorLabel(actor) });
  }

  /** Nommer ou retirer un modérateur : réservé à l'admin. Le rôle admin ne se donne qu'en ligne de commande. */
  public async setRole(userId: string, rawRole: unknown, actor: Staff): Promise<void> {
    if (actor.role !== "admin") throw new ApiError(403, "forbidden");
    if (rawRole !== "moderator" && rawRole !== null) throw new ApiError(400, "invalid_input");
    const target = await this.requireTarget(userId, actor);
    if (rawRole === "moderator" && (target.displayName === null || !target.emailVerified)) throw new ApiError(400, "invalid_input");
    await this.users.update(userId, { role: rawRole });
    await this.gameLogs.audit({ caseId: `user:${target.id}`, action: rawRole === null ? "remove_moderator" : "make_moderator", at: new Date(), actor: actorLabel(actor) });
  }

  public async searchUsers(rawQuery: unknown): Promise<AdminUserView[]> {
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
    if (query.length < 2 || query.length > 100) return [];
    return (await this.users.search(query, 30)).map(adminUserView);
  }

  public async sanctionedUsers(): Promise<AdminUserView[]> {
    return (await this.users.listSanctioned(new Date(), 200)).map(adminUserView);
  }

  public async recentGames(rawBefore: unknown): Promise<unknown[]> {
    const before = typeof rawBefore === "string" && !Number.isNaN(Date.parse(rawBefore)) ? new Date(rawBefore) : undefined;
    return this.gameLogs.recentGames(50, before);
  }

  /** Lever toutes les sanctions d'un compte : mute, ban (définitif compris) et avertissements. */
  public async clearSanctions(userId: string, actor: Staff): Promise<void> {
    if (actor.role !== "admin") throw new ApiError(403, "forbidden");
    const target = await this.requireTarget(userId, actor);
    const now = new Date();
    await this.users.update(userId, {
      bannedUntil: null,
      banReason: null,
      chatMutedUntil: null,
      warnings: [],
      sanctions: target.sanctions.map((sanction) => (sanction.revokedAt === null ? { ...sanction, revokedAt: now } : sanction)),
    });
    await this.gameLogs.audit({ caseId: `user:${target.id}`, action: "clear_sanctions", at: now, actor: actorLabel(actor) });
    this.onWarn(userId);
  }

  /** Demandes de ban définitif des modérateurs, avec le dossier et la personne visée (admin seulement). */
  public async banRequests(rawStatus: unknown) {
    const status = rawStatus === "accepted" || rawStatus === "rejected" ? rawStatus : "pending";
    const requests = await this.gameLogs.listBanRequests(status);
    return Promise.all(
      requests.map(async (request) => {
        const identity = (await this.gameLogs.getIdentities(request.caseId)).find((entry) => entry.pseudonym === request.pseudonym) ?? null;
        const account = identity?.userId == null ? null : await this.users.findById(identity.userId);
        return {
          ...request,
          case: await this.gameLogs.getCase(request.caseId),
          target: identity === null ? null : { pseudo: identity.pseudo, userId: identity.userId, displayName: account?.displayName ?? null, email: account?.email ?? null },
        };
      }),
    );
  }

  public async decideBanRequest(id: string, accept: boolean, actor: Staff): Promise<void> {
    if (actor.role !== "admin") throw new ApiError(403, "forbidden");
    const request = await this.gameLogs.getBanRequest(id);
    if (request === null || request.status !== "pending") throw new ApiError(404, "not_found");
    if (accept) {
      const identity = (await this.gameLogs.getIdentities(request.caseId)).find((entry) => entry.pseudonym === request.pseudonym);
      if (identity?.userId == null) throw new ApiError(400, "guest_not_sanctionable");
      const target = await this.requireTarget(identity.userId, actor);
      const now = new Date();
      await this.users.update(target.id, {
        bannedUntil: PERMANENT_BAN_UNTIL,
        banReason: request.reason,
        sanctions: [...target.sanctions, { id: newSanctionId(), type: "permanent_ban", at: now, until: null, reason: request.reason, by: actorLabel(actor), caseId: request.caseId, revokedAt: null } satisfies Sanction].slice(-100),
      });
      await this.gameLogs.audit({ caseId: request.caseId, action: "permanent_ban", at: now, detail: request.pseudonym, actor: actorLabel(actor) });
      await this.onBan(target.id);
    } else {
      await this.gameLogs.audit({ caseId: request.caseId, action: "ban_request_rejected", at: new Date(), detail: request.pseudonym, actor: actorLabel(actor) });
    }
    await this.gameLogs.decideBanRequest(id, accept ? "accepted" : "rejected", actorLabel(actor));
  }

  /** Personne ne sanctionne l'admin ; un modérateur ne sanctionne pas un autre membre de l'équipe. */
  private async requireTarget(userId: string, actor: Staff): Promise<User> {
    const target = await this.users.findById(userId);
    if (target === null) throw new ApiError(404, "not_found");
    if (target.role === "admin" || target.id === actor.id) throw new ApiError(400, "invalid_input");
    if (target.role === "moderator" && actor.role !== "admin") throw new ApiError(403, "forbidden");
    return target;
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
