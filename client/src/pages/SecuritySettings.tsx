import { useState } from "react";
import QRCode from "qrcode";

import { api } from "../api";
import type { Account } from "../api";

type Props = { user: Account; onChanged: () => Promise<void> };

/** Sécurité du compte : double authentification facultative et changement d'email. */
export function SecuritySettings({ user, onChanged }: Props): JSX.Element {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailStep, setEmailStep] = useState<"idle" | "code">("idle");
  const [emailCode, setEmailCode] = useState("");

  const run = async (action: () => Promise<void>, success: string): Promise<void> => {
    setMessage(null);
    try {
      await action();
      setMessage({ text: success, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Erreur", error: true });
    }
  };

  return (
    <section className="friends-section">
      <h3 className="field-label">Sécurité</h3>
      {message !== null ? <p className={message.error ? "form-message form-message--error" : "form-message"} role="alert">{message.text}</p> : null}

      {user.isAdmin === true ? (
        <p className="field-hint">Compte administrateur : double authentification obligatoire, gérée sur le serveur.</p>
      ) : user.totpEnabled === true ? (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api("/me/totp/disable", { body: { code } });
              setCode("");
              await onChanged();
            }, "Double authentification désactivée.");
          }}
        >
          <p>Double authentification <strong>activée</strong> : un code est demandé à chaque connexion.</p>
          <label className="field">
            <span className="field-label">Code actuel pour la désactiver</span>
            <input className="code-input" inputMode="numeric" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
          </label>
          <button type="submit" className="secondary">Désactiver</button>
        </form>
      ) : setup === null ? (
        <button
          type="button"
          className="secondary"
          onClick={() =>
            void run(async () => {
              const result = await api<{ secret: string; uri: string }>("/me/totp/setup", { body: {} });
              const svg = await QRCode.toString(result.uri, { type: "svg", margin: 1 });
              setSetup({ secret: result.secret, qr: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` });
            }, "Scanne le QR code avec ton application d'authentification, puis saisis le code affiché.")
          }
        >
          Activer la double authentification
        </button>
      ) : (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api("/me/totp/enable", { body: { code } });
              setSetup(null);
              setCode("");
              await onChanged();
            }, "Double authentification activée.");
          }}
        >
          <img className="totp-qr" src={setup.qr} alt="QR code de double authentification" />
          <p className="mono totp-secret">{setup.secret}</p>
          <label className="field">
            <span className="field-label">Code affiché par l'application</span>
            <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
          </label>
          <button type="submit">Confirmer l'activation</button>
        </form>
      )}

      {emailStep === "idle" ? (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api("/me/email", { body: { email: newEmail, password } });
              setEmailStep("code");
              setPassword("");
            }, `Un code a été envoyé à ${newEmail}.`);
          }}
        >
          <label className="field">
            <span className="field-label">Nouvelle adresse email</span>
            <input type="email" autoComplete="email" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
          </label>
          {user.hasPassword === true ? (
            <label className="field">
              <span className="field-label">Mot de passe actuel</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          ) : null}
          <button type="submit" className="secondary">Changer d'email</button>
        </form>
      ) : (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api("/me/email/confirm", { body: { code: emailCode } });
              setEmailStep("idle");
              setEmailCode("");
              setNewEmail("");
              await onChanged();
            }, "Adresse email modifiée.");
          }}
        >
          <label className="field">
            <span className="field-label">Code reçu sur la nouvelle adresse</span>
            <input className="code-input" inputMode="numeric" pattern="\d{6}" maxLength={6} required value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, ""))} />
          </label>
          <button type="submit">Confirmer</button>
          <button type="button" className="link-button" onClick={() => setEmailStep("idle")}>Annuler</button>
        </form>
      )}
    </section>
  );
}
