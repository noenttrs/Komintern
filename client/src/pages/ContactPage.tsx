import { useState } from "react";

import { api } from "../api";
import { PageShell } from "../components/PageShell";

export function ContactPage({ defaultEmail, contactEmail }: { defaultEmail: string; contactEmail: string }): JSX.Element {
  const [email, setEmail] = useState(defaultEmail);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  return (
    <PageShell title="Contact">
      <div className="panel page-panel">
        <p>
          Une question, un bug, une idée ou un signalement ? Écris ici{contactEmail !== "" ? <> ou directement à <a href={`mailto:${contactEmail}`}>{contactEmail}</a></> : null}.
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
                setStatus({ text: "Message envoyé, merci ! Tu recevras une réponse par email.", error: false });
              })
              .catch((error: unknown) => setStatus({ text: error instanceof Error ? error.message : "Erreur", error: true }))
              .finally(() => setBusy(false));
          }}
        >
          <label className="field">
            <span className="field-label">Ton email (pour te répondre)</span>
            <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Sujet</span>
            <input required maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Message</span>
            <textarea required minLength={10} maxLength={5000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <button type="submit" disabled={busy}>Envoyer</button>
        </form>
      </div>
    </PageShell>
  );
}
