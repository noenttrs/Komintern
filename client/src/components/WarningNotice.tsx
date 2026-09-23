import { useState } from "react";

import { api } from "../api";
import { useI18n } from "../i18n";

/** Avertissement de la modération : affiché jusqu'à ce que le joueur confirme l'avoir lu. */
export function WarningNotice({ warnings, onSeen }: { warnings: Array<{ id: string; at: string; reason: string }>; onSeen: () => void }): JSX.Element | null {
  const { t, locale } = useI18n();
  const [sending, setSending] = useState(false);
  if (warnings.length === 0) return null;
  return (
    <div className="page-layer warning-layer" role="alertdialog" aria-modal="true" aria-labelledby="warning-title">
      <div className="panel warning-card">
        <h2 id="warning-title">{t("warning.title")}</h2>
        <ul className="back-list">
          {warnings.map((warning) => (
            <li key={warning.id}>
              <span className="mono">{new Date(warning.at).toLocaleDateString(locale)}</span> {warning.reason}
            </li>
          ))}
        </ul>
        <p>{t("warning.text")}</p>
        <button
          type="button"
          disabled={sending}
          onClick={() => {
            setSending(true);
            api("/me/warnings/seen", { body: {} })
              .then(onSeen)
              .catch(() => setSending(false));
          }}
        >
          {t("warning.ok")}
        </button>
      </div>
    </div>
  );
}
