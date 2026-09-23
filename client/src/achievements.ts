import type { Stats } from "./api";
import { translate as t } from "./i18n";

export type Achievement = { id: string; title: string; description: string; unlocked: boolean; progress?: string };

/** Succès calculés à partir des statistiques du compte (aucun stockage supplémentaire). */
export function achievements(stats: Stats): Achievement[] {
  const played = stats.wins + stats.losses;
  const winsNazi = stats.winsNazi ?? 0;
  const winsCommunist = stats.winsCommunist ?? 0;
  const step = (value: number, target: number) => ({ unlocked: value >= target, progress: value >= target ? undefined : `${value}/${target}` });
  return [
    { id: "first-game", title: t("achievements.firstGameTitle"), description: t("achievements.firstGameText"), ...step(played, 1) },
    { id: "first-win", title: t("achievements.firstWinTitle"), description: t("achievements.firstWinText"), ...step(stats.wins, 1) },
    { id: "both-sides", title: t("achievements.bothSidesTitle"), description: t("achievements.bothSidesText"), unlocked: winsNazi > 0 && winsCommunist > 0 },
    { id: "saboteur", title: t("achievements.saboteurTitle"), description: t("achievements.saboteurText"), ...step(winsNazi, 5) },
    { id: "resistant", title: t("achievements.resistantTitle"), description: t("achievements.resistantText"), ...step(winsCommunist, 5) },
    { id: "regular", title: t("achievements.regularTitle"), description: t("achievements.regularText"), ...step(played, 25) },
    { id: "veteran", title: t("achievements.veteranTitle"), description: t("achievements.veteranText"), ...step(stats.wins, 50) },
    {
      id: "strategist",
      title: t("achievements.strategistTitle"),
      description: t("achievements.strategistText"),
      unlocked: played >= 20 && stats.wins / played >= 0.6,
      progress: played < 20 ? t("achievements.strategistProgress", { played }) : undefined,
    },
  ];
}
