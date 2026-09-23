import type { Stats } from "../api";
import { useI18n } from "../i18n";

/** Statistiques du profil : bilan global, puis détail par camp. */
export function StatsGrid({ stats }: { stats: Stats }): JSX.Element {
  const { t, tp } = useI18n();
  const percent = (part: number, total: number): string => (total === 0 ? "—" : t("common.percent", { value: Math.round((part / total) * 100) }));
  const played = stats.wins + stats.losses;
  if (played === 0) {
    return (
      <div className="stats stats--empty">
        <p className="stat-headline">{t("stats.zero")}</p>
        <p>{t("stats.emptyHint")}</p>
      </div>
    );
  }
  const winsNazi = stats.winsNazi ?? 0;
  const winsCommunist = stats.winsCommunist ?? 0;
  const camps = [
    { label: t("stats.asNazi"), games: stats.gamesNazi, wins: winsNazi },
    { label: t("stats.asCommunist"), games: stats.gamesCommunist, wins: winsCommunist },
  ];
  return (
    <div className="stats">
      <dl className="stats-grid">
        <div className="stat stat--main">
          <dt className="field-label">{t("stats.played")}</dt>
          <dd className="stat__value">{played}</dd>
        </div>
        <div className="stat">
          <dt className="field-label">{t("stats.wins")}</dt>
          <dd className="stat__value">{stats.wins}</dd>
        </div>
        <div className="stat">
          <dt className="field-label">{t("stats.losses")}</dt>
          <dd className="stat__value">{stats.losses}</dd>
        </div>
        <div className="stat">
          <dt className="field-label">{t("stats.winRate")}</dt>
          <dd className="stat__value">{percent(stats.wins, played)}</dd>
        </div>
      </dl>
      <h3 className="field-label">{t("stats.byCamp")}</h3>
      <ul className="camp-list">
        {camps.map((camp) => (
          <li key={camp.label} className="camp">
            <div className="camp__head">
              <strong>{camp.label}</strong>
              <span className="mono">
                {tp("stats.games", camp.games)} · {tp("stats.victories", camp.wins)} · {percent(camp.wins, camp.games)}
              </span>
            </div>
            <div className="camp__bar" role="img" aria-label={t("stats.campBar", { camp: camp.label, share: percent(camp.games, played) })}>
              <span style={{ width: `${played === 0 ? 0 : (camp.games / played) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
