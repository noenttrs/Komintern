import type { Stats } from "../api";

/** Les 4 statistiques du profil, plus le taux de victoire. */
export function StatsGrid({ stats }: { stats: Stats }): JSX.Element {
  const played = stats.wins + stats.losses;
  const rate = played === 0 ? "—" : `${Math.round((stats.wins / played) * 100)} %`;
  const cells: Array<[string, string | number]> = [
    ["Victoires", stats.wins],
    ["Défaites", stats.losses],
    ["Parties en nazi", stats.gamesNazi],
    ["Parties en communiste", stats.gamesCommunist],
  ];
  return (
    <div className="stats">
      <dl className="stats-grid">
        {cells.map(([label, value]) => (
          <div key={label} className="stat">
            <dt className="field-label">{label}</dt>
            <dd className="stat__value">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mono">{played} partie{played > 1 ? "s" : ""} · taux de victoire {rate}</p>
    </div>
  );
}
