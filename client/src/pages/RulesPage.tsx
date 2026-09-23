import { PageShell } from "../components/PageShell";
import { useI18n } from "../i18n";

// Formats officiels (docs/regles.md) : [joueurs, nazis, communistes, victoires, tailles d'équipe].
const FORMATS: Array<[number, number, number, number, string]> = [
  [4, 1, 3, 3, "2 · 3 · 2 · 3 · 3"],
  [5, 2, 3, 3, "2 · 3 · 2 · 3 · 3"],
  [6, 2, 4, 4, "2 · 3 · 3 · 4 · 3 · 4 · 4"],
  [7, 3, 4, 4, "2 · 3 · 3 · 4 · 3 · 4 · 4"],
  [8, 3, 5, 5, "3 · 3 · 4 · 4 · 3 · 4 · 5 · 4 · 5"],
  [9, 3, 6, 5, "3 · 4 · 4 · 5 · 4 · 5 · 5 · 6 · 6"],
  [10, 4, 6, 6, "3 · 4 · 4 · 5 · 4 · 5 · 5 · 6 · 5 · 6 · 6"],
  [11, 4, 7, 6, "3 · 4 · 4 · 5 · 4 · 5 · 6 · 5 · 6 · 6 · 7"],
];

/** Règles consultables à tout moment, y compris en pleine partie (calque au-dessus du jeu). */
export function RulesPage({ playerCount }: { playerCount: number | null }): JSX.Element {
  const { t, tr } = useI18n();
  return (
    <PageShell title={t("rules.title")}>
      <article className="panel page-panel prose">
        <h2>{t("rules.goalTitle")}</h2>
        <p>{tr("rules.goal")}</p>
        <h2>{t("rules.roundTitle")}</h2>
        <ol>
          <li>{tr("rules.proposal")}</li>
          <li>{tr("rules.confidence")}</li>
          <li>{tr("rules.mission")}</li>
        </ol>
        <p>{t("rules.chef")}</p>
        <h2>{t("rules.formatsTitle")}</h2>
        <div className="table-scroll">
          <table className="rules-table">
            <thead>
              <tr><th>{t("rules.players")}</th><th>{t("rules.nazis")}</th><th>{t("rules.wins")}</th><th>{t("rules.teams")}</th></tr>
            </thead>
            <tbody>
              {FORMATS.map(([players, nazis, , wins, sizes]) => (
                <tr key={players} className={players === playerCount ? "rules-table__current" : undefined}>
                  <td>{players}</td><td>{nazis}</td><td>{wins}</td><td>{sizes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {playerCount !== null ? <p className="mono">{t("rules.yourGame", { count: playerCount })}</p> : null}
        <h2>{t("rules.tipsTitle")}</h2>
        <ul>
          <li>{t("rules.tip1")}</li>
          <li>{t("rules.tip2")}</li>
          <li>{t("rules.tip3")}</li>
        </ul>
      </article>
    </PageShell>
  );
}
