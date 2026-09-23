import crypto from "crypto";

import type { Kv } from "../store/kv";

export type CodePurpose = "verify" | "reset" | "change";

const CODE_TTL_SECONDS = 15 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;
/** Essais par email et par usage sur 24 h, même en redemandant des codes. */
const DAILY_ATTEMPTS = 20;
const DAY_SECONDS = 24 * 3600;

export type CodeCheck = "ok" | "invalid" | "expired" | "too_many_attempts";

/** Codes à 6 chiffres envoyés par email ; seul leur hash est stocké. */
export class EmailCodeService {
  public constructor(private readonly kv: Kv) {}

  /** Nouveau code, ou null si un code a été envoyé il y a moins d'une minute. */
  public async issue(purpose: CodePurpose, email: string): Promise<string | null> {
    if (!(await this.kv.setIfAbsent(`codecool:${purpose}:${email}`, "1", RESEND_COOLDOWN_SECONDS))) {
      return null;
    }
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    await this.kv.set(`code:${purpose}:${email}`, JSON.stringify({ hash: hash(email, code) }), CODE_TTL_SECONDS);
    await this.kv.del(`codeatt:${purpose}:${email}`);
    return code;
  }

  public async check(purpose: CodePurpose, email: string, code: string): Promise<CodeCheck> {
    const key = `code:${purpose}:${email}`;
    const raw = await this.kv.get(key);
    if (raw === null) {
      return "expired";
    }
    // Compteurs atomiques (INCR) : des requêtes simultanées ne peuvent pas partager un même essai.
    const attempts = await this.kv.incrWithTtl(`codeatt:${purpose}:${email}`, CODE_TTL_SECONDS);
    const daily = await this.kv.incrWithTtl(`codebudget:${purpose}:${email}`, DAY_SECONDS);
    if (attempts > MAX_ATTEMPTS || daily > DAILY_ATTEMPTS) {
      await this.kv.del(key);
      return "too_many_attempts";
    }
    const stored = JSON.parse(raw) as { hash: string };
    const expected = Buffer.from(stored.hash, "hex");
    const actual = Buffer.from(hash(email, code), "hex");
    if (!crypto.timingSafeEqual(expected, actual)) {
      return "invalid";
    }
    await this.kv.del(key);
    await this.kv.del(`codeatt:${purpose}:${email}`);
    return "ok";
  }
}

function hash(email: string, code: string): string {
  return crypto.createHash("sha256").update(`${email}:${code}`).digest("hex");
}
