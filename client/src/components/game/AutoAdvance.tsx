import { useEffect, useRef, useState } from "react";

import { useI18n } from "../../i18n";

/**
 * Compte à rebours de l'enchaînement automatique : barre qui se vide et secondes restantes.
 * `deadline` est une heure locale (ms) ; rien n'est affiché sans délai en cours.
 */
export function AutoAdvance({ deadline, hint }: { deadline: number | null; hint?: string }): JSX.Element | null {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const total = useRef<{ deadline: number | null; duration: number }>({ deadline: null, duration: 1 });
  if (total.current.deadline !== deadline) {
    total.current = { deadline, duration: deadline === null ? 1 : Math.max(1, deadline - Date.now()) };
  }

  useEffect(() => {
    if (deadline === null) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [deadline]);

  if (deadline === null) return null;
  const remaining = Math.max(0, deadline - now);
  const fraction = Math.min(1, remaining / total.current.duration);
  return (
    <div className="auto-advance" role="timer" aria-live="off">
      <div className="auto-advance__track">
        <div className="auto-advance__bar" style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <p>{t("autoAdvance.next", { seconds: Math.ceil(remaining / 1000) })}{hint !== undefined ? ` · ${hint}` : ""}</p>
    </div>
  );
}
