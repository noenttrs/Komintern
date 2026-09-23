import type { Stats } from "./api";

export type Achievement = { id: string; title: string; description: string; unlocked: boolean; progress?: string };

/** Succès calculés à partir des statistiques du compte (aucun stockage supplémentaire). */
export function achievements(stats: Stats): Achievement[] {
  const played = stats.wins + stats.losses;
  const winsNazi = stats.winsNazi ?? 0;
  const winsCommunist = stats.winsCommunist ?? 0;
  const step = (value: number, target: number) => ({ unlocked: value >= target, progress: value >= target ? undefined : `${value}/${target}` });
  return [
    { id: "first-game", title: "Premier pas", description: "Terminer une partie.", ...step(played, 1) },
    { id: "first-win", title: "Première victoire", description: "Gagner une partie.", ...step(stats.wins, 1) },
    { id: "both-sides", title: "Agent double", description: "Gagner au moins une fois dans chaque camp.", unlocked: winsNazi > 0 && winsCommunist > 0 },
    { id: "saboteur", title: "Saboteur", description: "Gagner 5 parties en nazi.", ...step(winsNazi, 5) },
    { id: "resistant", title: "Résistant", description: "Gagner 5 parties en communiste.", ...step(winsCommunist, 5) },
    { id: "regular", title: "Habitué", description: "Jouer 25 parties.", ...step(played, 25) },
    { id: "veteran", title: "Vétéran", description: "Gagner 50 parties.", ...step(stats.wins, 50) },
    {
      id: "strategist",
      title: "Stratège",
      description: "Avoir au moins 60 % de victoires sur 20 parties ou plus.",
      unlocked: played >= 20 && stats.wins / played >= 0.6,
      progress: played < 20 ? `${played}/20 parties` : undefined,
    },
  ];
}
