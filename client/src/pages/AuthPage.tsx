import { useState } from "react";
import type { FormEvent } from "react";

import { ApiRequestError } from "../api";
import { PageShell } from "../components/PageShell";
import type { AccountActions, AccountState } from "../hooks/useAccount";
import { navigate } from "../router";

type Mode = "login" | "register" | "verify" | "forgot" | "reset" | "totp";

/** Connexion / inscription. Un compte est facultatif : on peut toujours jouer en invité. */
export function AuthPage({ account }: { account: AccountState & AccountActions }): JSX.Element {
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
      setMessage({ text: error instanceof Error ? error.message : "Erreur", error: true });
    } finally {
      setBusy(false);
    }
  };

  const google = account.config?.googleEnabled === true ? (
    <>
      <a className="button-link" href="/api/auth/google">Continuer avec Google</a>
      <p className="divider"><span>ou</span></p>
    </>
  ) : null;

  const emailField = (
    <label className="field">
      <span className="field-label">Email</span>
      <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
    </label>
  );

  return (
    <PageShell
      title={
        mode === "register" ? "Créer un compte" : mode === "login" || mode === "totp" ? "Connexion" : mode === "verify" ? "Valider l'email" : "Mot de passe oublié"
      }
    >
      <div className="panel page-panel">
        <p>Un compte est facultatif : il garde tes statistiques et te permet d'ajouter des amis. Tu peux jouer sans.</p>
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
              <span className="field-label">Mot de passe</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" disabled={busy}>Se connecter</button>
            <button type="button" className="secondary" onClick={() => { setMode("register"); setMessage(null); }}>Créer un compte</button>
            <button type="button" className="link-button" onClick={() => { setMode("forgot"); setMessage(null); }}>Mot de passe oublié ?</button>
          </form>
        ) : null}

        {mode === "register" ? (
          <form className="form" onSubmit={run(async () => { await account.register(email, password, displayName); setMode("verify"); setMessage({ text: "Un code à 6 chiffres vient d'être envoyé à ton adresse.", error: false }); })}>
            {google}
            {emailField}
            <label className="field">
              <span className="field-label">Pseudo (3 à 20 caractères)</span>
              <input autoComplete="nickname" required minLength={3} maxLength={20} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Mot de passe (10 caractères minimum)</span>
              <input type="password" autoComplete="new-password" required minLength={10} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" disabled={busy}>Créer mon compte</button>
            <button type="button" className="secondary" onClick={() => { setMode("login"); setMessage(null); }}>J'ai déjà un compte</button>
          </form>
        ) : null}

        {mode === "totp" && challenge !== null ? (
          <form className="form" onSubmit={run(async () => { await account.completeTotpLogin(challenge, code); navigate("/"); })}>
            <p>Double authentification : saisis le code à 6 chiffres de ton application.</p>
            <label className="field">
              <span className="field-label">Code de double authentification</span>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="code-input" />
            </label>
            <button type="submit" disabled={busy}>Valider</button>
            <button type="button" className="secondary" onClick={() => { setMode("login"); setChallenge(null); }}>Retour</button>
          </form>
        ) : null}

        {mode === "verify" ? (
          <form className="form" onSubmit={run(async () => { await account.verify(email, code); navigate("/profil"); })}>
            {emailField}
            <label className="field">
              <span className="field-label">Code reçu par email</span>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="code-input" />
            </label>
            <button type="submit" disabled={busy}>Valider</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void run(async () => { await account.resendCode(email); setMessage({ text: "Nouveau code envoyé.", error: false }); })({ preventDefault: () => undefined } as FormEvent)}>
              Renvoyer un code
            </button>
          </form>
        ) : null}

        {mode === "forgot" ? (
          <form className="form" onSubmit={run(async () => { await account.forgotPassword(email); setMode("reset"); setMessage({ text: "Si un compte existe avec cet email, un code vient d'y être envoyé.", error: false }); })}>
            {emailField}
            <button type="submit" disabled={busy}>Recevoir un code</button>
            <button type="button" className="secondary" onClick={() => setMode("login")}>Retour</button>
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
              <span className="field-label">Code reçu par email</span>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="code-input" />
            </label>
            <label className="field">
              <span className="field-label">Nouveau mot de passe</span>
              <input type="password" autoComplete="new-password" required minLength={10} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" disabled={busy}>Changer le mot de passe</button>
          </form>
        ) : null}
      </div>
    </PageShell>
  );
}
