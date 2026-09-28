import { type ReactNode, useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n";

/** Résumé des réglages de la room, lisible par tous (« Sur place · Privée · Classique · Nazis révélés »). */
export function RoomSummary({ chatEnabled, isPublic, pace, showPace, revealRoles, admission = "open" }: { chatEnabled: boolean; isPublic: boolean; pace: "classic" | "quick"; showPace: boolean; revealRoles: boolean; admission?: "open" | "request" }): JSX.Element {
  const { t } = useI18n();
  const parts = [
    chatEnabled ? t("roomSettings.remote") : t("roomSettings.local"),
    isPublic ? t("roomSettings.public") : t("roomSettings.private"),
    ...(showPace ? [pace === "quick" ? t("roomSettings.quick") : t("roomSettings.classic")] : []),
    revealRoles ? t("roomSettings.reveal") : t("roomSettings.secret"),
    ...(admission === "request" ? [t("admission.summary")] : []),
  ];
  return <p className="mono room-summary">{parts.join(" · ")}</p>;
}

/** Feuille des réglages de l'hôte, regroupés par section ; Échap ou « OK » la ferment. */
export function RoomSettingsSheet({ onClose, children }: { onClose: () => void; children: ReactNode }): JSX.Element {
  const { t } = useI18n();
  const sheet = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="tip-overlay" onClick={onClose}>
      <div ref={sheet} className="tip-card settings-sheet" role="dialog" aria-modal="true" aria-labelledby="room-settings-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="room-settings-title">{t("roomSettings.title")}</h2>
        {children}
        <button type="button" onClick={onClose}>{t("roomSettings.done")}</button>
      </div>
    </div>
  );
}

export function SettingsSection({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="settings-section">
      <h3 className="field-label">{title}</h3>
      {children}
    </section>
  );
}

/** Liens de la vue publique (grand écran, stream) : copiés sans être affichés en clair. */
export function PublicViewLinks({ code, token, request }: { code: string; token: string | null; request: (reset?: boolean) => void }): JSX.Element {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);
  if (token === null) {
    return (
      <button type="button" className="secondary" onClick={() => request(false)}>
        {t("board.open")}
      </button>
    );
  }
  const base = `${window.location.origin}/r/${code}/ecran?t=${encodeURIComponent(token)}`;
  const links: Array<[string, string]> = [
    ["screen", base],
    ["stream", `${base}&stream=1`],
  ];
  const copy = (key: string, url: string) => {
    void navigator.clipboard?.writeText(url).then(() => setCopied(key)).catch(() => window.prompt(t("board.copy"), url));
  };
  return (
    <div className="public-links">
      {links.map(([key, url]) => (
        <div key={key} className="public-links__row">
          <span>{key === "screen" ? t("board.linkScreen") : t("board.linkStream")}</span>
          <button type="button" className="secondary" onClick={() => copy(key, url)}>
            {copied === key ? t("board.copied") : t("board.copy")}
          </button>
          {key === "screen" ? (
            <a className="button-link" href={url} target="_blank" rel="noopener noreferrer">
              {t("board.openShort")}
            </a>
          ) : null}
        </div>
      ))}
      <button type="button" className="link-button" onClick={() => request(true)}>
        {t("board.reset")}
      </button>
    </div>
  );
}
