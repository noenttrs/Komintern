import { PageShell } from "../components/PageShell";
import { useI18n } from "../i18n";

// Formats officiels (docs/REGLES.md) : [joueurs, nazis, communistes, victoires, tailles d'équipe].
const FORMATS: Array<[number, number, number, number, string]> = [
  [3, 1, 2, 2, "2 · 2 · 2"],
  [4, 1, 3, 3, "2 · 3 · 2 · 3 · 3"],
  [5, 2, 3, 3, "2 · 3 · 2 · 3 · 3"],
  [6, 2, 4, 4, "2 · 3 · 3 · 4 · 3 · 4 · 4"],
  [7, 3, 4, 4, "2 · 3 · 3 · 4 · 3 · 4 · 4"],
  [8, 3, 5, 5, "3 · 3 · 4 · 4 · 3 · 4 · 5 · 4 · 5"],
  [9, 3, 6, 5, "3 · 4 · 4 · 5 · 4 · 5 · 5 · 6 · 6"],
  [10, 4, 6, 6, "3 · 4 · 4 · 5 · 4 · 5 · 5 · 6 · 5 · 6 · 6"],
  [11, 4, 7, 6, "3 · 4 · 4 · 5 · 4 · 5 · 6 · 5 · 6 · 6 · 7"],
  [12, 4, 8, 7, "3 · 4 · 4 · 5 · 4 · 5 · 5 · 6 · 5 · 6 · 6 · 7 · 7"],
  [13, 5, 8, 7, "3 · 4 · 4 · 5 · 4 · 5 · 6 · 5 · 6 · 6 · 7 · 6 · 7"],
  [14, 5, 9, 8, "3 · 4 · 4 · 5 · 4 · 5 · 5 · 6 · 5 · 6 · 6 · 7 · 6 · 7 · 8"],
];

// Partie rapide (au choix à la création de la room) : 5 missions, premier camp à 3.
const QUICK_FORMATS: Array<[number, number, string]> = [
  [6, 2, "2 · 3 · 3 · 4 · 4"],
  [7, 3, "2 · 3 · 3 · 4 · 4"],
  [8, 3, "3 · 4 · 4 · 5 · 5"],
  [9, 3, "3 · 4 · 4 · 5 · 5"],
  [10, 4, "3 · 4 · 4 · 5 · 5"],
  [11, 4, "4 · 4 · 5 · 5 · 6"],
  [12, 4, "4 · 5 · 5 · 6 · 6"],
  [13, 5, "4 · 5 · 5 · 6 · 6"],
  [14, 5, "5 · 5 · 6 · 6 · 7"],
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
        {playerCount !== null && playerCount > 2 ? <p className="mono">{t("rules.yourGame", { count: playerCount })}</p> : null}
        <h2>{t("rules.quickTitle")}</h2>
        <p>{t("rules.quickIntro")}</p>
        <div className="table-scroll">
          <table className="rules-table">
            <thead>
              <tr><th>{t("rules.players")}</th><th>{t("rules.nazis")}</th><th>{t("rules.teams")}</th></tr>
            </thead>
            <tbody>
              {QUICK_FORMATS.map(([players, nazis, sizes]) => (
                <tr key={players} className={players === playerCount ? "rules-table__current" : undefined}>
                  <td>{players}</td><td>{nazis}</td><td>{sizes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2>{t("duel.rulesTitle")}</h2>
        <p>{t("rules.duelIntro")}</p>
        <ul>
          <li>{t("duel.rulesCommunists")}</li>
          <li>{t("duel.rulesMixed")}</li>
          <li>{t("duel.rulesNazis")}</li>
        </ul>
        <h2>{t("rules.tipsTitle")}</h2>
        <ul>
          <li>{t("rules.tip1")}</li>
          <li>{t("rules.tip2")}</li>
          <li>{t("rules.tip3")}</li>
        </ul>
        <p className="mono">
          {tr("rules.license", {
            cc: (label: string) => (
              <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr" target="_blank" rel="noopener noreferrer license">
                {label}
              </a>
            ),
          })}
        </p>
      </article>
    </PageShell>
  );
}
