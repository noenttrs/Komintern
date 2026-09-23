import { log } from "../logger";

export type Mail = { to: string; subject: string; text: string; html: string };

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Envoi via l'API HTTP de Resend (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer implements Mailer {
  public constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  public async send(mail: Mail): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`resend responded ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
  }
}

/** Sans clé Resend (dev) : le mail est écrit dans les logs du serveur. */
export class LogMailer implements Mailer {
  public async send(mail: Mail): Promise<void> {
    log.warn("email not sent (no RESEND_API_KEY), logged instead", { to: mail.to, subject: mail.subject, text: mail.text });
  }
}

export class MemoryMailer implements Mailer {
  public readonly sent: Mail[] = [];

  public async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }

  public lastCodeFor(email: string): string | null {
    const mail = [...this.sent].reverse().find((entry) => entry.to === email);
    return mail?.text.match(/\b(\d{6})\b/)?.[1] ?? null;
  }
}

export function codeMail(to: string, purpose: "verify" | "reset", code: string): Mail {
  const title = purpose === "verify" ? "Valide ton adresse email" : "Réinitialise ton mot de passe";
  const intro =
    purpose === "verify"
      ? "Voici ton code pour valider ton compte Nazi Communiste :"
      : "Voici ton code pour choisir un nouveau mot de passe sur Nazi Communiste :";
  return {
    to,
    subject: `${code} — ${title}`,
    text: `${intro}\n\n${code}\n\nIl expire dans 15 minutes. Si tu n'es pas à l'origine de cette demande, ignore ce message.`,
    html: `<div style="font-family:monospace;color:#0f0f0f"><p>${intro}</p><p style="font-size:28px;letter-spacing:6px;border:1px solid #111;display:inline-block;padding:8px 16px">${code}</p><p>Il expire dans 15 minutes. Si tu n'es pas à l'origine de cette demande, ignore ce message.</p></div>`,
  };
}
