import crypto from "crypto";

import type { Kv } from "../store/kv";

const RETENTION_SECONDS = 400 * 24 * 3600;

/**
 * Mesure d'audience sans cookie ni service tiers (conforme à l'exemption CNIL) :
 * - visiteurs uniques du jour : empreinte SHA-256(IP + navigateur + sel du jour) ajoutée à un
 *   HyperLogLog Redis, qui ne conserve aucune empreinte ; le sel change chaque jour et n'est
 *   jamais écrit sur disque, donc un visiteur ne peut pas être suivi d'un jour à l'autre ;
 * - pages vues : simple compteur par chemin normalisé (sans identifiant de room ni de compte).
 */
export class Audience {
  private salt = { day: "", value: "" };

  public constructor(private readonly kv: Kv) {}

  public async record(rawPath: unknown, ip: string, userAgent: string, now = new Date()): Promise<void> {
    const path = normalizePath(rawPath);
    if (path === null || /bot|crawl|spider|slurp|preview|headless/i.test(userAgent)) {
      return;
    }
    const day = now.toISOString().slice(0, 10);
    const fingerprint = crypto.createHash("sha256").update(`${this.saltFor(day)}|${ip}|${userAgent}`).digest("hex");
    await this.kv.pfadd(`aud:uv:${day}`, fingerprint);
    await this.kv.hincr(`aud:pv:${day}`, path);
    await this.kv.expire(`aud:uv:${day}`, RETENTION_SECONDS);
    await this.kv.expire(`aud:pv:${day}`, RETENTION_SECONDS);
  }

  /** Visiteurs et pages vues par jour sur `days` jours, et pages les plus vues. */
  public async summary(days: number, now = new Date()): Promise<{
    daily: Array<{ day: string; visitors: number; pageviews: number }>;
    topPages: Array<{ path: string; views: number }>;
  }> {
    const daily: Array<{ day: string; visitors: number; pageviews: number }> = [];
    const totals = new Map<string, number>();
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const day = new Date(now.getTime() - offset * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const pages = await this.kv.hgetall(`aud:pv:${day}`);
      let pageviews = 0;
      for (const [path, count] of Object.entries(pages)) {
        pageviews += Number(count);
        totals.set(path, (totals.get(path) ?? 0) + Number(count));
      }
      daily.push({ day, visitors: await this.kv.pfcount(`aud:uv:${day}`), pageviews });
    }
    const topPages = [...totals].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views).slice(0, 10);
    return { daily, topPages };
  }

  private saltFor(day: string): string {
    if (this.salt.day !== day) {
      this.salt = { day, value: crypto.randomBytes(32).toString("hex") };
    }
    return this.salt.value;
  }
}

const KNOWN_PAGES = ["/", "/connexion", "/profil", "/amis", "/regles", "/a-propos", "/mentions-legales", "/contact", "/soutenir"];

/** Chemin normalisé : les codes de room et identifiants de compte sont retirés. */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  const path = raw.split("?")[0]?.replace(/\/+$/, "") || "/";
  if (/^\/r\/[A-Za-z0-9_-]+$/.test(path)) return "/r/:code";
  if (/^\/profil\/[A-Za-z0-9_-]+$/.test(path)) return "/profil/:ami";
  return KNOWN_PAGES.includes(path) ? path : null;
}
