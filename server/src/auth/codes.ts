import crypto from "crypto";

import type { Kv } from "../store/kv";

export type CodePurpose = "verify" | "reset" | "change";

const CODE_TTL_SECONDS = 15 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

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
    await this.kv.set(`code:${purpose}:${email}`, JSON.stringify({ hash: hash(email, code), attempts: 0 }), CODE_TTL_SECONDS);
    return code;
  }

  public async check(purpose: CodePurpose, email: string, code: string): Promise<CodeCheck> {
    const key = `code:${purpose}:${email}`;
    const raw = await this.kv.get(key);
    if (raw === null) {
      return "expired";
    }
    const stored = JSON.parse(raw) as { hash: string; attempts: number };
    if (stored.attempts >= MAX_ATTEMPTS) {
      await this.kv.del(key);
      return "too_many_attempts";
    }
    const expected = Buffer.from(stored.hash, "hex");
    const actual = Buffer.from(hash(email, code), "hex");
    if (!crypto.timingSafeEqual(expected, actual)) {
      await this.kv.set(key, JSON.stringify({ ...stored, attempts: stored.attempts + 1 }), CODE_TTL_SECONDS);
      return "invalid";
    }
    await this.kv.del(key);
    return "ok";
  }
}

function hash(email: string, code: string): string {
  return crypto.createHash("sha256").update(`${email}:${code}`).digest("hex");
}
