import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import type { RoomPlayer, UIPhase } from "../types";

type Props = {
  players: RoomPlayer[];
  myId: string | null;
  phase: UIPhase;
  onVote: (playerId: string, skip: boolean) => void;
};

function formatAway(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Un joueur est absent depuis 30 s en pleine partie : petit message avec un bouton de vote pour
 * continuer sans lui. La moitié des joueurs connectés suffit (la majorité si leur nombre est impair).
 */
export function AbsencePrompt({ players, myId, phase, onVote }: Props): JSX.Element | null {
  const { t } = useI18n();
  // Minuterie de rafraîchissement ; la durée d'absence est recalculée à chaque rendu.
  const [, setTick] = useState(0);
  const away = phase === "end_game" || phase === "replay_waiting" ? [] : players.filter((player) => player.id !== myId && !player.isAfk && player.absence);
  const iAmAway = players.some((player) => player.id === myId && (player.isAfk || player.absence));

  useEffect(() => {
    if (away.length === 0) return undefined;
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [away.length]);

  const now = Date.now();
  const shown = away.filter((player) => now >= player.absence!.promptAt);
  if (shown.length === 0 || iAmAway) return null;
  const beforeRoles = phase === "table_order" || phase === "role_reveal";

  return (
    <div className="absence-stack">
      {shown.map((player) => {
        const absence = player.absence!;
        const name = player.pseudo ?? "?";
        const voted = myId !== null && absence.votes.includes(myId);
        const count = `${absence.votes.length}/${absence.needed}`;
        return (
          <div key={player.id} className="absence-card absence-card--mini" role="status">
            <p>
              <strong>{t("absence.title", { name, away: formatAway(now - absence.since) })}</strong>
              <br />
              {beforeRoles ? t("absence.consequenceCancel") : t("absence.consequenceForfeit")}
            </p>
            <button type="button" className={voted ? "" : "secondary"} aria-pressed={voted} onClick={() => onVote(player.id, !voted)}>
              {voted ? t("absence.unvote", { count }) : t("absence.vote", { count })}
            </button>
          </div>
        );
      })}
    </div>
  );
}
