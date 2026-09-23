import { useEffect, useState } from "react";

import { api } from "../api";
import { useI18n } from "../i18n";

type PlayedGame = {
  id: string;
  endedAt: string;
  playerCount: number;
  faction: "nazi" | "communist" | null;
  won: boolean | null;
  reason: "missions" | "forfeit" | null;
  mode?: "missions" | "duel";
  scores: { nazi: number; communist: number };
  missions: Array<{ missionIndex: number; result: "nazi" | "communist"; naziVotes: number; teamSize: number }>;
  teammates: string[];
};

/** Dernières parties du joueur connecté (visibles par lui seul). */
export function GameHistory(): JSX.Element {
  const { t, tp, locale } = useI18n();
  const [games, setGames] = useState<PlayedGame[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api<{ games: PlayedGame[] }>("/me/games")
      .then((result) => setGames(result.games))
      .catch(() => setGames([]));
  }, []);

  if (games === null) return <p>{t("gameHistory.loading")}</p>;
  return (
    <section className="friends-section">
      <h3 className="field-label">{t("gameHistory.title")}</h3>
      {games.length === 0 ? <p>{t("gameHistory.empty")}</p> : null}
      <ul className="history-list">
        {games.map((game) => (
          <li key={game.id} className="history-item">
            <button type="button" className="history-item__head" aria-expanded={openId === game.id} onClick={() => setOpenId(openId === game.id ? null : game.id)}>
              <strong>{game.won === null ? t("gameHistory.game") : game.won ? t("gameHistory.win") : t("gameHistory.loss")}</strong>
              <span>{game.faction === "nazi" ? t("gameHistory.asNazi") : t("gameHistory.asCommunist")}</span>
              <span className="mono">
                {game.mode === "duel"
                  ? t("gameHistory.duelSummary", { date: new Date(game.endedAt).toLocaleDateString(locale) })
                  : t("gameHistory.summary", {
                      communist: game.scores.communist,
                      nazi: game.scores.nazi,
                      players: game.playerCount,
                      date: new Date(game.endedAt).toLocaleDateString(locale),
                    })}
              </span>
            </button>
            <span className="history-missions" aria-label={t("gameHistory.missions")}>
              {game.missions.map((mission) => (
                <span
                  key={mission.missionIndex}
                  className={mission.result === "communist" ? "dot" : "dot dot--full"}
                  title={
                    mission.result === "communist"
                      ? t("gameHistory.titleSuccess", { index: mission.missionIndex })
                      : tp("gameHistory.titleSabotaged", mission.naziVotes, { index: mission.missionIndex })
                  }
                />
              ))}
            </span>
            {openId === game.id ? (
              <div className="history-item__details">
                {game.reason === "forfeit" ? <p>{t("gameHistory.forfeit")}</p> : null}
                <ol className="back-list">
                  {game.missions.map((mission) => (
                    <li key={mission.missionIndex}>
                      {mission.result === "communist"
                        ? t("gameHistory.lineSuccess", { index: mission.missionIndex, size: mission.teamSize })
                        : tp("gameHistory.lineSabotaged", mission.naziVotes, { index: mission.missionIndex, size: mission.teamSize })}
                    </li>
                  ))}
                </ol>
                <p>{t("gameHistory.with", { names: game.teammates.join(", ") })}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mono">{t("gameHistory.legend")}</p>
    </section>
  );
}
