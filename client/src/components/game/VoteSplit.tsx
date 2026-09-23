import { useI18n } from "../../i18n";
import type { ConfidenceVote } from "../../types";

/** Résultat d'un vote de confiance en deux listes, Pour et Contre, plutôt qu'un vote par nom. */
export function VoteSplit({ votes, nameById, compact = false }: { votes: Record<string, ConfidenceVote>; nameById: (id: string) => string; compact?: boolean }): JSX.Element {
  const { t } = useI18n();
  const yes = Object.entries(votes).filter(([, vote]) => vote === "yes").map(([id]) => nameById(id));
  const no = Object.entries(votes).filter(([, vote]) => vote !== "yes").map(([id]) => nameById(id));
  if (compact) {
    return (
      <span className="vote-split-inline">
        <strong>{t("game.yes")} ({yes.length})</strong> {yes.join(", ") || "—"} · <strong>{t("game.no")} ({no.length})</strong> {no.join(", ") || "—"}
      </span>
    );
  }
  return (
    <div className="vote-split">
      {[
        { label: t("game.yes"), names: yes },
        { label: t("game.no"), names: no },
      ].map((column) => (
        <div key={column.label} className="vote-split__column">
          <p className="vote-split__title">
            {column.label} ({column.names.length})
          </p>
          <ul>
            {column.names.map((name) => (
              <li key={name}>{name}</li>
            ))}
            {column.names.length === 0 ? <li>—</li> : null}
          </ul>
        </div>
      ))}
    </div>
  );
}
