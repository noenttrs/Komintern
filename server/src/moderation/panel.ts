import crypto from "crypto";

import { ApiError } from "../auth/accounts";
import type { BanRequest, GameLogStore, ModerationCase } from "../store/gamelog";
import { newLogId } from "../store/gamelog";
import type { Sanction, User, UserStore } from "../store/users";

// Panel de modération : les modérateurs voient les conversations signalées, anonymisées
// (« Joueur A, B… »), et choisissent une conséquence. Le serveur, seul à connaître le lien entre
// un pseudonyme et une personne, l'applique : le modérateur ne voit jamais l'identité.

export type Moderator = { id: string; name: string; role: "admin" | "moderator" };

export type SanctionInput = { pseudonym: unknown; type: unknown; duration: unknown; reason: unknown };

/** Mute : quelques heures ; ban du chat : quelques jours. Au-delà, demande de ban définitif. */
const MUTE_HOURS = [1, 24];
const CHAT_BAN_DAYS = [7, 30];
const HOUR_MS = 3600 * 1000;

export type Participant = {
  pseudonym: string;
  kind: "account" | "guest";
  /** Sanctions déjà reçues (sans dire lesquelles ni par qui) : aide à proportionner. */
  priorSanctions: number;
  restriction: "banned" | "muted" | null;
};

export function actorLabel(actor: Moderator): string {
  return `${actor.name} (${actor.role === "admin" ? "admin" : "modérateur"})`;
}

function parseReason(raw: unknown): string {
  const reason = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  if (reason === "") throw new ApiError(400, "reason_required");
  return reason;
}

export class ModerationPanel {
  public constructor(
    private readonly users: UserStore,
    private readonly logs: GameLogStore,
    /** Sanction appliquée : mettre à jour les connexions du joueur et le prévenir. */
    private readonly onSanction: (userId: string) => void = () => undefined,
  ) {}

  public listCases(status: unknown): Promise<ModerationCase[]> {
    return this.logs.listCases(status === "open" || status === "resolved" ? status : undefined);
  }

  public async caseDetail(id: string, actor: Moderator) {
    const moderationCase = await this.requireCase(id);
    await this.logs.audit({ caseId: id, action: "show", at: new Date(), actor: actorLabel(actor) });
    const identities = await this.logs.getIdentities(id);
    const accounts = await this.users.findManyByIds(identities.map((identity) => identity.userId).filter((userId): userId is string => userId !== null));
    const now = new Date();
    const participants: Participant[] = identities.map((identity) => {
      const account = accounts.find((user) => user.id === identity.userId);
      return {
        pseudonym: identity.pseudonym,
        kind: account === undefined ? "guest" : "account",
        priorSanctions: account === undefined ? 0 : account.sanctions.length + account.warnings.length,
        restriction: account === undefined ? null : account.bannedUntil !== null && account.bannedUntil > now ? "banned" : account.chatMutedUntil !== null && account.chatMutedUntil > now ? "muted" : null,
      };
    });
    const banRequests = (await this.logs.listBanRequests()).filter((request) => request.caseId === id);
    return { case: moderationCase, participants, banRequests, audit: await this.logs.auditTrail(id) };
  }

  /** Applique une conséquence à un participant du dossier, sans révéler qui il est. */
  public async sanction(caseId: string, input: SanctionInput, actor: Moderator): Promise<{ applied: string }> {
    await this.requireCase(caseId);
    const pseudonym = typeof input.pseudonym === "string" ? input.pseudonym : "";
    const identity = (await this.logs.getIdentities(caseId)).find((entry) => entry.pseudonym === pseudonym);
    if (identity === undefined) throw new ApiError(404, "not_found");
    if (identity.userId === null) throw new ApiError(400, "guest_not_sanctionable");
    const target = await this.users.findById(identity.userId);
    if (target === null) throw new ApiError(400, "guest_not_sanctionable");
    if (target.role !== null) throw new ApiError(403, "forbidden");
    const reason = parseReason(input.reason);
    const now = new Date();

    switch (input.type) {
      case "warn": {
        await this.notify(target, reason, now);
        await this.audit(caseId, "warn", `${pseudonym} · ${reason}`, actor);
        return { applied: "warn" };
      }
      case "mute":
      case "chat_ban": {
        const amount = Number(input.duration);
        const allowed = input.type === "mute" ? MUTE_HOURS : CHAT_BAN_DAYS;
        if (!allowed.includes(amount)) throw new ApiError(400, "invalid_input");
        const until = new Date(now.getTime() + amount * (input.type === "mute" ? HOUR_MS : 24 * HOUR_MS));
        const label = input.type === "mute" ? `${amount} h` : `${amount} j`;
        const sanction: Sanction = { id: newSanctionId(), type: input.type, at: now, until, reason, by: actorLabel(actor), caseId, revokedAt: null };
        await this.users.update(target.id, {
          chatMutedUntil: target.chatMutedUntil !== null && target.chatMutedUntil > until ? target.chatMutedUntil : until,
          sanctions: [...target.sanctions, sanction].slice(-100),
        });
        await this.notify(await this.fresh(target.id), `${input.type === "mute" ? "Chat coupé" : "Chat suspendu"} ${label} : ${reason}`, now);
        await this.audit(caseId, input.type, `${pseudonym} · ${label} · ${reason}`, actor);
        return { applied: input.type };
      }
      case "ban_request": {
        const request: BanRequest = {
          id: newLogId("banreq"),
          caseId,
          pseudonym,
          reason,
          requestedBy: actorLabel(actor),
          createdAt: now,
          status: "pending",
          decidedAt: null,
          decidedBy: null,
        };
        if ((await this.logs.listBanRequests("pending")).some((pending) => pending.caseId === caseId && pending.pseudonym === pseudonym)) {
          throw new ApiError(409, "ban_request_pending");
        }
        await this.logs.createBanRequest(request);
        await this.audit(caseId, "ban_request", `${pseudonym} · ${reason}`, actor);
        return { applied: "ban_request" };
      }
      default:
        throw new ApiError(400, "invalid_input");
    }
  }

  public async resolve(caseId: string, rawNote: unknown, actor: Moderator): Promise<void> {
    const note = typeof rawNote === "string" && rawNote.trim() !== "" ? rawNote.trim().slice(0, 500) : "résolu";
    if (!(await this.logs.resolveCase(caseId, note))) throw new ApiError(404, "not_found");
    await this.audit(caseId, "resolve", note, actor);
  }

  private async requireCase(id: string): Promise<ModerationCase> {
    const moderationCase = await this.logs.getCase(id);
    if (moderationCase === null) throw new ApiError(404, "not_found");
    return moderationCase;
  }

  private async fresh(userId: string): Promise<User> {
    return (await this.users.findById(userId)) as User;
  }

  /** Le joueur est informé de chaque sanction (avertissement affiché à sa prochaine visite). */
  private async notify(target: User, reason: string, at: Date): Promise<void> {
    await this.users.update(target.id, { warnings: [...target.warnings, { id: `w_${crypto.randomBytes(6).toString("hex")}`, at, reason, seenAt: null }].slice(-50) });
    this.onSanction(target.id);
  }

  private async audit(caseId: string, action: string, detail: string, actor: Moderator): Promise<void> {
    await this.logs.audit({ caseId, action, at: new Date(), detail, actor: actorLabel(actor) });
  }
}

export function newSanctionId(): string {
  return `s_${crypto.randomBytes(6).toString("hex")}`;
}
