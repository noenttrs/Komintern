import { useState } from "react";
import QRCode from "qrcode";

import { api } from "../api";
import type { Account } from "../api";
import { useI18n } from "../i18n";

type Props = { user: Account; onChanged: () => Promise<void> };

/** Sécurité du compte : double authentification facultative et changement d'email. */
export function SecuritySettings({ user, onChanged }: Props): JSX.Element {
  const { t, tr } = useI18n();
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
      setMessage({ text: error instanceof Error ? error.message : t("common.error"), error: true });
    }
  };

  return (
    <section className="friends-section">
      <h3 className="field-label">{t("security.title")}</h3>
      {message !== null ? <p className={message.error ? "form-message form-message--error" : "form-message"} role="alert">{message.text}</p> : null}

      {user.isAdmin === true ? (
        <p className="field-hint">{t("security.adminHint")}</p>
      ) : user.totpEnabled === true ? (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api("/me/totp/disable", { body: { code } });
              setCode("");
              await onChanged();
            }, t("security.disabled"));
          }}
        >
          <p>{tr("security.enabledInfo")}</p>
          <label className="field">
            <span className="field-label">{t("security.disableCode")}</span>
            <input className="code-input" inputMode="numeric" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
          </label>
          <button type="submit" className="secondary">{t("security.disable")}</button>
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
            }, t("security.scan"))
          }
        >
          {t("security.enable")}
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
            }, t("security.enabled"));
          }}
        >
          <img className="totp-qr" src={setup.qr} alt={t("security.qrAlt")} />
          <p className="mono totp-secret">{setup.secret}</p>
          <label className="field">
            <span className="field-label">{t("security.appCode")}</span>
            <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
          </label>
          <button type="submit">{t("security.confirmEnable")}</button>
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
            }, t("security.emailCodeSent", { email: newEmail }));
          }}
        >
          <label className="field">
            <span className="field-label">{t("security.newEmail")}</span>
            <input type="email" autoComplete="email" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
          </label>
          {user.hasPassword === true ? (
            <label className="field">
              <span className="field-label">{t("security.currentPassword")}</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          ) : null}
          <button type="submit" className="secondary">{t("security.changeEmail")}</button>
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
            }, t("security.emailChanged"));
          }}
        >
          <label className="field">
            <span className="field-label">{t("security.newEmailCode")}</span>
            <input className="code-input" inputMode="numeric" pattern="\d{6}" maxLength={6} required value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, ""))} />
          </label>
          <button type="submit">{t("common.confirm")}</button>
          <button type="button" className="link-button" onClick={() => setEmailStep("idle")}>{t("common.cancel")}</button>
        </form>
      )}
    </section>
  );
}
