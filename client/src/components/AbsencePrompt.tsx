import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import type { RoomPlayer, UIPhase } from "../types";

/** Délai avant de proposer d'attendre : un rechargement ou une micro-coupure ne dérange personne. */
export const PROMPT_AFTER_MS = 5_000;

type Props = {
  players: RoomPlayer[];
  myId: string | null;
  phase: UIPhase;
  onHold: (playerId: string) => void;
  onRelease: (playerId: string) => void;
};

function formatLeft(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : `${seconds} s`;
}

/**
 * Un joueur s'est déconnecté en pleine partie : les autres choisissent de l'attendre (il est
 * prévenu par notification) ou laissent le compte à rebours aller à son terme.
 */
export function AbsencePrompt({ players, myId, phase, onHold, onRelease }: Props): JSX.Element | null {
  const { t } = useI18n();
  // Minuterie de rafraîchissement ; le temps restant est recalculé à chaque rendu.
  const [, setTick] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const away = phase === "end_game" || phase === "replay_waiting" ? [] : players.filter((player) => player.id !== myId && !player.isAfk && player.absence);

  useEffect(() => {
    if (away.length === 0) return undefined;
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [away.length]);

  if (away.length === 0) return null;
  const now = Date.now();
  const beforeRoles = phase === "table_order";

  return (
    <div className="absence-stack">
      {away.map((player) => {
        const absence = player.absence!;
        const name = player.pseudo ?? "?";
        const left = formatLeft(absence.kickAt - now);
        if (absence.heldBy !== null) {
          return (
            <div key={player.id} className="absence-card absence-card--held" role="status">
              <p>{t("absence.held", { by: absence.heldBy, name, left })}</p>
              <button type="button" className="secondary" onClick={() => onRelease(player.id)}>
                {t("absence.stopWaiting")}
              </button>
            </div>
          );
        }
        const key = `${player.id}:${absence.since}`;
        if (now - absence.since < PROMPT_AFTER_MS || dismissed.has(key)) return null;
        return (
          <div key={player.id} className="absence-card" role="alertdialog" aria-labelledby={`absence-${player.id}`}>
            <p id={`absence-${player.id}`}>
              <strong>{t("absence.title", { name })}</strong>
            </p>
            <p>{beforeRoles ? t("absence.countdownCancel", { left }) : t("absence.countdownForfeit", { left })}</p>
            <div className="absence-card__actions">
              <button type="button" onClick={() => onHold(player.id)}>
                {t("absence.wait", { name })}
              </button>
              <button type="button" className="secondary" onClick={() => setDismissed((current) => new Set(current).add(key))}>
                {t("absence.dontWait")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
