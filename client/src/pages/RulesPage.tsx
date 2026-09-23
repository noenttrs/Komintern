import { PageShell } from "../components/PageShell";

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
  return (
    <PageShell title="Règles du jeu">
      <article className="panel page-panel prose">
        <h2>But</h2>
        <p>
          Deux camps secrets. Les <strong>nazis</strong> (minorité) connaissent tous les rôles et veulent faire échouer les missions. Les{" "}
          <strong>communistes</strong> (majorité) ne connaissent que leur propre rôle et doivent démasquer les saboteurs. Le premier camp
          à remporter (joueurs ÷ 2) + 1 missions gagne.
        </p>
        <h2>Une manche</h2>
        <ol>
          <li><strong>Proposition</strong> : le chef choisit une équipe de la taille demandée.</li>
          <li><strong>Vote de confiance</strong> (public) : il faut une majorité stricte de « pour ». En cas de refus ou d'égalité, le même chef propose une autre équipe.</li>
          <li><strong>Mission</strong> (secret) : chaque membre de l'équipe vote. Un seul vote nazi fait échouer la mission. Un communiste ne peut voter que communiste.</li>
        </ol>
        <p>Le rôle de chef passe au joueur suivant à chaque nouvelle manche.</p>
        <h2>Formats</h2>
        <div className="table-scroll">
          <table className="rules-table">
            <thead>
              <tr><th>Joueurs</th><th>Nazis</th><th>Victoires</th><th>Équipes</th></tr>
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
        {playerCount !== null ? <p className="mono">Votre partie : {playerCount} joueurs (ligne surlignée).</p> : null}
        <h2>Astuces</h2>
        <ul>
          <li>Carte de rôle : maintenez-la appuyée pour revoir votre rôle en toute discrétion.</li>
          <li>Faites-la glisser pour afficher l'historique des votes et des missions.</li>
          <li>Recharger la page ou perdre le réseau ne fait pas perdre sa place, mais une absence de plus de 60 s fait perdre son camp.</li>
        </ul>
      </article>
    </PageShell>
  );
}
