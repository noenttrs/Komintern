import { type ReactNode, useEffect, useRef } from "react";

import { useI18n } from "../i18n";

/** Résumé des réglages de la room, lisible par tous (« Sur place · Privée · Classique · Nazis révélés »). */
export function RoomSummary({ chatEnabled, isPublic, pace, showPace, revealRoles }: { chatEnabled: boolean; isPublic: boolean; pace: "classic" | "quick"; showPace: boolean; revealRoles: boolean }): JSX.Element {
  const { t } = useI18n();
  const parts = [
    chatEnabled ? t("roomSettings.remote") : t("roomSettings.local"),
    isPublic ? t("roomSettings.public") : t("roomSettings.private"),
    ...(showPace ? [pace === "quick" ? t("roomSettings.quick") : t("roomSettings.classic")] : []),
    revealRoles ? t("roomSettings.reveal") : t("roomSettings.secret"),
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
