// Statistiques du tableau de bord admin : uniquement des agrégats (aucun pseudo, message ni
// identifiant de compte ne sort d'ici), calculés à partir des journaux de parties et des dates
// d'inscription.
import type { InsightGame } from "../store/gamelog";
import type { AccountSignup } from "../store/users";

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** Fenêtre des graphiques de parties. */
export const INSIGHT_DAYS = 30;
/** Fenêtre des inscriptions et de la rétention. */
export const INSIGHT_WEEKS = 12;
/** Une partie « rejouée » : une nouvelle partie commence dans la même room peu après. */
const REPLAY_WINDOW_MS = 15 * 60 * 1000;
/** Rétention : semaines suivies après l'inscription (semaine 0 = celle de l'inscription). */
const RETENTION_WEEKS = 5;

export type Insights = {
  generatedAt: string;
  kpis: {
    accounts: number;
    verifiedAccounts: number;
    activeAccounts7d: number;
    activeAccounts30d: number;
    finishedGames: number;
    abortedGames: number;
    medianMinutes: number | null;
    /** Part des parties terminées suivies d'une nouvelle partie dans la même room. */
    replayRate: number | null;
    /** Part des places en partie occupées par un compte (le reste : invités). */
    accountSeatShare: number | null;
  };
  gamesPerDay: Array<{ day: string; finished: number; aborted: number }>;
  byPlayerCount: Array<{ players: number; games: number; medianMinutes: number; naziWinRate: number | null }>;
  modes: Array<{ mode: InsightGame["mode"]; games: number }>;
  replay: { replay: number; quit: number; none: number; replayedGames: number; finishedGames: number };
  signupsPerWeek: Array<{ week: string; signups: number }>;
  retention: Array<{ cohort: string; size: number; weeks: Array<number | null> }>;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] as number) : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

const round = (value: number, digits = 1): number => Math.round(value * 10 ** digits) / 10 ** digits;
const minutes = (game: InsightGame): number => (game.endedAt.getTime() - game.startedAt.getTime()) / 60_000;
const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/** Lundi 00:00 UTC de la semaine d'une date. */
function weekStart(date: Date): Date {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offset * DAY_MS);
}

/**
 * `games` : parties des INSIGHT_WEEKS dernières semaines (la rétention remonte jusque-là) ;
 * les graphiques de parties n'en gardent que les INSIGHT_DAYS derniers jours.
 */
export function computeInsights(games: InsightGame[], accounts: AccountSignup[], now = new Date()): Insights {
  const since = new Date(now.getTime() - INSIGHT_DAYS * DAY_MS);
  const recent = games.filter((game) => game.endedAt >= since);
  const finished = recent.filter((game) => game.outcome === "finished");
  const aborted = recent.filter((game) => game.outcome === "aborted");

  // Parties par jour (jours sans partie compris, pour un axe du temps continu).
  const perDay = new Map<string, { finished: number; aborted: number }>();
  for (let offset = INSIGHT_DAYS - 1; offset >= 0; offset -= 1) perDay.set(dayKey(new Date(now.getTime() - offset * DAY_MS)), { finished: 0, aborted: 0 });
  for (const game of recent) {
    const entry = perDay.get(dayKey(game.endedAt));
    if (entry !== undefined) entry[game.outcome] += 1;
  }

  // Durée et victoires par nombre de joueurs (parties terminées).
  const byCount = new Map<number, InsightGame[]>();
  for (const game of finished) byCount.set(game.playerCount, [...(byCount.get(game.playerCount) ?? []), game]);
  const byPlayerCount = [...byCount.entries()]
    .sort(([a], [b]) => a - b)
    .map(([players, list]) => {
      const decided = list.filter((game) => game.mode !== "duel" && game.winner !== null);
      return {
        players,
        games: list.length,
        medianMinutes: round(median(list.map(minutes)) ?? 0),
        naziWinRate: decided.length === 0 ? null : round(decided.filter((game) => game.winner === "nazi").length / decided.length, 3),
      };
    });

  const modeCounts = new Map<InsightGame["mode"], number>();
  for (const game of finished) modeCounts.set(game.mode, (modeCounts.get(game.mode) ?? 0) + 1);

  // Bouton « Rejouer » : réponses des joueurs, et parties effectivement suivies d'une autre.
  const byRoom = new Map<string, InsightGame[]>();
  for (const game of games) byRoom.set(game.roomCode, [...(byRoom.get(game.roomCode) ?? []), game]);
  const replayed = finished.filter((game) =>
    (byRoom.get(game.roomCode) ?? []).some((next) => next !== game && next.startedAt >= game.endedAt && next.startedAt.getTime() - game.endedAt.getTime() <= REPLAY_WINDOW_MS),
  ).length;
  const replayClicks = finished.reduce((total, game) => total + game.replayChoices.replay, 0);
  const quitClicks = finished.reduce((total, game) => total + game.replayChoices.quit, 0);
  const seats = finished.reduce((total, game) => total + game.playerCount, 0);
  const accountSeats = finished.reduce((total, game) => total + game.userIds.length, 0);

  const activeSince = (ms: number) => new Set(finished.filter((game) => game.endedAt.getTime() >= now.getTime() - ms).flatMap((game) => game.userIds)).size;

  // Inscriptions par semaine et rétention : part des comptes d'une semaine d'inscription ayant
  // terminé une partie N semaines plus tard (null tant que la semaine N n'a pas commencé).
  const currentWeek = weekStart(now).getTime();
  const firstWeek = currentWeek - (INSIGHT_WEEKS - 1) * WEEK_MS;
  const playedWeeks = new Map<string, Set<number>>();
  for (const game of games) {
    if (game.outcome !== "finished") continue;
    for (const id of game.userIds) {
      const weeks = playedWeeks.get(id) ?? new Set<number>();
      weeks.add(weekStart(game.endedAt).getTime());
      playedWeeks.set(id, weeks);
    }
  }
  const signupsPerWeek: Insights["signupsPerWeek"] = [];
  const retention: Insights["retention"] = [];
  for (let week = firstWeek; week <= currentWeek; week += WEEK_MS) {
    const cohort = accounts.filter((account) => weekStart(account.createdAt).getTime() === week);
    const label = dayKey(new Date(week));
    signupsPerWeek.push({ week: label, signups: cohort.length });
    if (cohort.length === 0) continue;
    const weeks: Array<number | null> = [];
    for (let offset = 0; offset < RETENTION_WEEKS; offset += 1) {
      const target = week + offset * WEEK_MS;
      weeks.push(target > currentWeek ? null : round(cohort.filter((account) => playedWeeks.get(account.id)?.has(target) === true).length / cohort.length, 3));
    }
    retention.push({ cohort: label, size: cohort.length, weeks });
  }

  return {
    generatedAt: now.toISOString(),
    kpis: {
      accounts: accounts.length,
      verifiedAccounts: accounts.filter((account) => account.verified).length,
      activeAccounts7d: activeSince(7 * DAY_MS),
      activeAccounts30d: activeSince(INSIGHT_DAYS * DAY_MS),
      finishedGames: finished.length,
      abortedGames: aborted.length,
      medianMinutes: finished.length === 0 ? null : round(median(finished.map(minutes)) ?? 0),
      replayRate: finished.length === 0 ? null : round(replayed / finished.length, 3),
      accountSeatShare: seats === 0 ? null : round(accountSeats / seats, 3),
    },
    gamesPerDay: [...perDay.entries()].map(([day, counts]) => ({ day, ...counts })),
    byPlayerCount,
    modes: [...modeCounts.entries()].map(([mode, count]) => ({ mode, games: count })).sort((a, b) => b.games - a.games),
    replay: { replay: replayClicks, quit: quitClicks, none: Math.max(0, seats - replayClicks - quitClicks), replayedGames: replayed, finishedGames: finished.length },
    signupsPerWeek,
    retention,
  };
}
