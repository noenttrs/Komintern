import type { Stats } from "../api";

const percent = (part: number, total: number): string => (total === 0 ? "—" : `${Math.round((part / total) * 100)} %`);

/** Statistiques du profil : bilan global, puis détail par camp. */
export function StatsGrid({ stats }: { stats: Stats }): JSX.Element {
  const played = stats.wins + stats.losses;
  if (played === 0) {
    return (
      <div className="stats stats--empty">
        <p className="stat-headline">0 partie jouée</p>
        <p>Les statistiques se remplissent quand tu termines une partie en étant connecté.</p>
      </div>
    );
  }
  const winsNazi = stats.winsNazi ?? 0;
  const winsCommunist = stats.winsCommunist ?? 0;
  const camps = [
    { label: "En nazi", games: stats.gamesNazi, wins: winsNazi },
    { label: "En communiste", games: stats.gamesCommunist, wins: winsCommunist },
  ];
  return (
    <div className="stats">
      <dl className="stats-grid">
        <div className="stat stat--main">
          <dt className="field-label">Parties jouées</dt>
          <dd className="stat__value">{played}</dd>
        </div>
        <div className="stat">
          <dt className="field-label">Victoires</dt>
          <dd className="stat__value">{stats.wins}</dd>
        </div>
        <div className="stat">
          <dt className="field-label">Défaites</dt>
          <dd className="stat__value">{stats.losses}</dd>
        </div>
        <div className="stat">
          <dt className="field-label">Taux de victoire</dt>
          <dd className="stat__value">{percent(stats.wins, played)}</dd>
        </div>
      </dl>
      <h3 className="field-label">Par camp</h3>
      <ul className="camp-list">
        {camps.map((camp) => (
          <li key={camp.label} className="camp">
            <div className="camp__head">
              <strong>{camp.label}</strong>
              <span className="mono">
                {camp.games} partie{camp.games > 1 ? "s" : ""} · {camp.wins} victoire{camp.wins > 1 ? "s" : ""} · {percent(camp.wins, camp.games)}
              </span>
            </div>
            <div className="camp__bar" role="img" aria-label={`${camp.label} : ${percent(camp.games, played)} des parties`}>
              <span style={{ width: `${played === 0 ? 0 : (camp.games / played) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
