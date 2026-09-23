import { type ReactNode, useEffect, useState } from "react";

import { api } from "../api";
import { useI18n } from "../i18n";
import { navigate } from "../router";
import { PageShell } from "./PageShell";

export type StaffRole = "admin" | "moderator";

/**
 * Porte d'entrée des panels d'équipe (admin, modération) : double authentification obligatoire,
 * puis code TOTP pour élever la session. `base` : "/admin" ou "/moderation".
 */
export function StaffGate({ base, title, allowed, children }: { base: "/admin" | "/moderation"; title: string; allowed: boolean; children: (role: StaffRole) => ReactNode }): JSX.Element {
  const { t } = useI18n();
  const [elevated, setElevated] = useState<boolean | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [totpEnabled, setTotpEnabled] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    api<{ elevated: boolean; role: StaffRole; totpEnabled: boolean }>(`${base}/session`)
      .then((result) => {
        setElevated(result.elevated);
        setRole(result.role);
        setTotpEnabled(result.totpEnabled);
      })
      .catch(() => setElevated(false));
  }, [allowed, base]);

  if (!allowed) {
    return <PageShell title={t("admin.notFoundTitle")}><p>{t("admin.notFound")}</p></PageShell>;
  }
  if (!totpEnabled) {
    return (
      <PageShell title={title}>
        <div className="panel page-panel">
          <p>{t("admin.totpSetupRequired")}</p>
          <button type="button" onClick={() => navigate("/profil")}>{t("admin.openSecurity")}</button>
        </div>
      </PageShell>
    );
  }
  if (elevated !== true || role === null) {
    return (
      <PageShell title={title}>
        <div className="panel page-panel">
          <p>{t("admin.codePrompt")}</p>
          {error !== null ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              api(`${base}/session`, { body: { code } })
                .then(() => setElevated(true))
                .catch((submitError: unknown) => setError(submitError instanceof Error ? submitError.message : t("common.error")))
                .finally(() => setCode(""));
            }}
          >
            <label className="field">
              <span className="field-label">{t("auth.totpLabel")}</span>
              <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
            </label>
            <button type="submit" disabled={elevated === null}>{t("common.validate")}</button>
          </form>
        </div>
      </PageShell>
    );
  }
  return (
    <PageShell title={title} wide>
      {children(role)}
    </PageShell>
  );
}
