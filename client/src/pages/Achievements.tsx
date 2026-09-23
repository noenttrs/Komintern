import type { Stats } from "../api";
import { achievements } from "../achievements";
import { useI18n } from "../i18n";

export function Achievements({ stats }: { stats: Stats }): JSX.Element {
  const { t } = useI18n();
  const list = achievements(stats);
  const unlocked = list.filter((entry) => entry.unlocked).length;
  return (
    <section className="friends-section">
      <h3 className="field-label">{t("achievements.heading", { unlocked, total: list.length })}</h3>
      <ul className="achievements">
        {list.map((entry) => (
          <li key={entry.id} className={entry.unlocked ? "achievement achievement--unlocked" : "achievement"}>
            <strong>{entry.unlocked ? "★ " : "☆ "}{entry.title}</strong>
            <span>{entry.description}</span>
            {entry.progress !== undefined ? <span className="mono">{entry.progress}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
