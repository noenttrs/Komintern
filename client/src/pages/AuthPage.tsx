import { useState } from "react";
import type { FormEvent } from "react";

import { ApiRequestError } from "../api";
import { PageShell } from "../components/PageShell";
import type { AccountActions, AccountState } from "../hooks/useAccount";
import { useI18n } from "../i18n";
import { navigate } from "../router";

type Mode = "login" | "register" | "verify" | "forgot" | "reset" | "totp";

/** Connexion / inscription. Un compte est facultatif : on peut toujours jouer en invité. */
export function AuthPage({ account }: { account: AccountState & AccountActions }): JSX.Element {
  const { t } = useI18n();
  // Retour de Google avec la double authentification active : /connexion?totp=<jeton>
  const googleChallenge = new URLSearchParams(window.location.search).get("totp");
  const [mode, setMode] = useState<Mode>(googleChallenge !== null ? "totp" : "login");
  const [challenge, setChallenge] = useState<string | null>(googleChallenge);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const run = (action: () => Promise<void>) => async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "email_not_verified") {
        setMode("verify");
      }
      setMessage({ text: error instanceof Error ? error.message : t("common.error"), error: true });
    } finally {
      setBusy(false);
    }
  };

  const google = account.config?.googleEnabled === true ? (
    <>
      <a className="button-link" href="/api/auth/google">{t("auth.google")}</a>
      <p className="divider"><span>{t("auth.or")}</span></p>
    </>
  ) : null;

  const emailField = (
    <label className="field">
      <span className="field-label">{t("auth.email")}</span>
      <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
    </label>
  );

  return (
    <PageShell
      title={
        mode === "register"
          ? t("auth.titleRegister")
          : mode === "login" || mode === "totp"
            ? t("auth.titleLogin")
            : mode === "verify"
              ? t("auth.titleVerify")
              : t("auth.titleForgot")
      }
    >
      <div className="panel page-panel">
        <p>{t("auth.intro")}</p>
        {message !== null ? <p className={message.error ? "form-message form-message--error" : "form-message"} role="alert">{message.text}</p> : null}

        {mode === "login" ? (
          <form
            className="form"
            onSubmit={run(async () => {
              const token = await account.login(email, password);
              if (token !== null) {
                setChallenge(token);
                setCode("");
                setMode("totp");
                return;
              }
              navigate("/");
            })}
          >
            {google}
            {emailField}
            <label className="field">
              <span className="field-label">{t("auth.password")}</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" disabled={busy}>{t("common.login")}</button>
            <button type="button" className="secondary" onClick={() => { setMode("register"); setMessage(null); }}>{t("auth.register")}</button>
            <button type="button" className="link-button" onClick={() => { setMode("forgot"); setMessage(null); }}>{t("auth.forgot")}</button>
          </form>
        ) : null}

        {mode === "register" ? (
          <form className="form" onSubmit={run(async () => { await account.register(email, password, displayName); setMode("verify"); setMessage({ text: t("auth.codeSent"), error: false }); })}>
            {google}
            {emailField}
            <label className="field">
              <span className="field-label">{t("auth.displayName")}</span>
              <input autoComplete="nickname" required minLength={3} maxLength={20} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">{t("auth.newPasswordHint")}</span>
              <input type="password" autoComplete="new-password" required minLength={10} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" disabled={busy}>{t("auth.createAccount")}</button>
            <button type="button" className="secondary" onClick={() => { setMode("login"); setMessage(null); }}>{t("auth.haveAccount")}</button>
          </form>
        ) : null}

        {mode === "totp" && challenge !== null ? (
          <form className="form" onSubmit={run(async () => { await account.completeTotpLogin(challenge, code); navigate("/"); })}>
            <p>{t("auth.totpIntro")}</p>
            <label className="field">
              <span className="field-label">{t("auth.totpLabel")}</span>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="code-input" />
            </label>
            <button type="submit" disabled={busy}>{t("common.validate")}</button>
            <button type="button" className="secondary" onClick={() => { setMode("login"); setChallenge(null); }}>{t("common.back")}</button>
          </form>
        ) : null}

        {mode === "verify" ? (
          <form className="form" onSubmit={run(async () => { await account.verify(email, code); navigate("/profil"); })}>
            {emailField}
            <label className="field">
              <span className="field-label">{t("auth.emailCode")}</span>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="code-input" />
            </label>
            <button type="submit" disabled={busy}>{t("common.validate")}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void run(async () => { await account.resendCode(email); setMessage({ text: t("auth.newCodeSent"), error: false }); })({ preventDefault: () => undefined } as FormEvent)}>
              {t("auth.resend")}
            </button>
          </form>
        ) : null}

        {mode === "forgot" ? (
          <form className="form" onSubmit={run(async () => { await account.forgotPassword(email); setMode("reset"); setMessage({ text: t("auth.resetSent"), error: false }); })}>
            {emailField}
            <button type="submit" disabled={busy}>{t("auth.getCode")}</button>
            <button type="button" className="secondary" onClick={() => setMode("login")}>{t("common.back")}</button>
          </form>
        ) : null}

        {mode === "reset" ? (
          <form
            className="form"
            onSubmit={run(async () => {
              const token = await account.resetPassword(email, code, password);
              if (token !== null) {
                setChallenge(token);
                setCode("");
                setMode("totp");
                return;
              }
              navigate("/profil");
            })}
          >
            {emailField}
            <label className="field">
              <span className="field-label">{t("auth.emailCode")}</span>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="code-input" />
            </label>
            <label className="field">
              <span className="field-label">{t("auth.newPassword")}</span>
              <input type="password" autoComplete="new-password" required minLength={10} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" disabled={busy}>{t("auth.changePassword")}</button>
          </form>
        ) : null}
      </div>
    </PageShell>
  );
}
