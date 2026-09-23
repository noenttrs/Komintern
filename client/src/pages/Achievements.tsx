import type { Stats } from "../api";
import { achievements } from "../achievements";

export function Achievements({ stats }: { stats: Stats }): JSX.Element {
  const list = achievements(stats);
  const unlocked = list.filter((entry) => entry.unlocked).length;
  return (
    <section className="friends-section">
      <h3 className="field-label">Succès ({unlocked}/{list.length})</h3>
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
