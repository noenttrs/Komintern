import { useState } from "react";

import { api } from "../api";
import { PageShell } from "../components/PageShell";
import { useI18n } from "../i18n";

export function ContactPage({ defaultEmail, contactEmail }: { defaultEmail: string; contactEmail: string }): JSX.Element {
  const { t, tr } = useI18n();
  const [email, setEmail] = useState(defaultEmail);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  return (
    <PageShell title={t("contact.title")}>
      <div className="panel page-panel">
        <p>
          {tr("contact.intro", {
            direct: contactEmail !== "" ? tr("contact.direct", { email: <a href={`mailto:${contactEmail}`}>{contactEmail}</a> }) : "",
          })}
        </p>
        {status !== null ? <p className={status.error ? "form-message form-message--error" : "form-message"} role="alert">{status.text}</p> : null}
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setStatus(null);
            api("/contact", { body: { email, subject, message } })
              .then(() => {
                setSubject("");
                setMessage("");
                setStatus({ text: t("contact.sent"), error: false });
              })
              .catch((error: unknown) => setStatus({ text: error instanceof Error ? error.message : t("common.error"), error: true }))
              .finally(() => setBusy(false));
          }}
        >
          <label className="field">
            <span className="field-label">{t("contact.email")}</span>
            <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{t("contact.subject")}</span>
            <input required maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{t("contact.message")}</span>
            <textarea required minLength={10} maxLength={5000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <button type="submit" disabled={busy}>{t("common.send")}</button>
        </form>
      </div>
    </PageShell>
  );
}
