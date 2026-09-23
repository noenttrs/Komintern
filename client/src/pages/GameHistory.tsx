import { useEffect, useState } from "react";

import { api } from "../api";

type PlayedGame = {
  id: string;
  endedAt: string;
  playerCount: number;
  faction: "nazi" | "communist" | null;
  won: boolean | null;
  reason: "missions" | "forfeit" | null;
  scores: { nazi: number; communist: number };
  missions: Array<{ missionIndex: number; result: "nazi" | "communist"; naziVotes: number; teamSize: number }>;
  teammates: string[];
};

/** Dernières parties du joueur connecté (visibles par lui seul). */
export function GameHistory(): JSX.Element {
  const [games, setGames] = useState<PlayedGame[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api<{ games: PlayedGame[] }>("/me/games")
      .then((result) => setGames(result.games))
      .catch(() => setGames([]));
  }, []);

  if (games === null) return <p>Chargement de l'historique…</p>;
  return (
    <section className="friends-section">
      <h3 className="field-label">Dernières parties</h3>
      {games.length === 0 ? <p>Aucune partie terminée pour l'instant.</p> : null}
      <ul className="history-list">
        {games.map((game) => (
          <li key={game.id} className="history-item">
            <button type="button" className="history-item__head" aria-expanded={openId === game.id} onClick={() => setOpenId(openId === game.id ? null : game.id)}>
              <strong>{game.won === null ? "Partie" : game.won ? "Victoire" : "Défaite"}</strong>
              <span>en {game.faction === "nazi" ? "nazi" : "communiste"}</span>
              <span className="mono">
                {game.scores.communist}-{game.scores.nazi} · {game.playerCount} j. · {new Date(game.endedAt).toLocaleDateString("fr-FR")}
              </span>
            </button>
            <span className="history-missions" aria-label="Missions">
              {game.missions.map((mission) => (
                <span
                  key={mission.missionIndex}
                  className={mission.result === "communist" ? "dot" : "dot dot--full"}
                  title={`Mission ${mission.missionIndex} : ${mission.result === "communist" ? "réussie" : `sabotée (${mission.naziVotes} vote${mission.naziVotes > 1 ? "s" : ""} nazi)`}`}
                />
              ))}
            </span>
            {openId === game.id ? (
              <div className="history-item__details">
                {game.reason === "forfeit" ? <p>Partie terminée par abandon.</p> : null}
                <ol className="back-list">
                  {game.missions.map((mission) => (
                    <li key={mission.missionIndex}>
                      Mission {mission.missionIndex} ({mission.teamSize} joueurs) :{" "}
                      {mission.result === "communist" ? "réussie" : `sabotée, ${mission.naziVotes} vote${mission.naziVotes > 1 ? "s" : ""} nazi`}
                    </li>
                  ))}
                </ol>
                <p>Avec {game.teammates.join(", ")}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mono">○ mission réussie · ● mission sabotée</p>
    </section>
  );
}
