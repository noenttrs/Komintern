import { useCallback, useEffect, useState } from "react";

import { api, ApiRequestError } from "../api";
import { translate, useI18n } from "../i18n";
import { ChartFrame, ColumnChart, heatColor, Legend, SERIES, ShareBar, ValuesTable } from "./admin/charts";

type Mode = "duel" | "classic" | "quick" | "custom";

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
    replayRate: number | null;
    accountSeatShare: number | null;
  };
  gamesPerDay: Array<{ day: string; finished: number; aborted: number }>;
  byPlayerCount: Array<{ players: number; games: number; medianMinutes: number; naziWinRate: number | null }>;
  modes: Array<{ mode: Mode; games: number }>;
  replay: { replay: number; quit: number; none: number; replayedGames: number; finishedGames: number };
  signupsPerWeek: Array<{ week: string; signups: number }>;
  retention: Array<{ cohort: string; size: number; weeks: Array<number | null> }>;
};

const percent = (value: number | null): string => (value === null ? "—" : `${Math.round(value * 100)} %`);
const shortDay = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Tableau de bord : parties, comptes, rétention et bouton « Rejouer » (agrégats seulement). */
export function InsightsTab(): JSX.Element {
  const { t } = useI18n();
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    api<Insights>("/admin/insights")
      .then(setData)
      .catch((loadError: unknown) => setError(loadError instanceof ApiRequestError ? loadError.message : translate("common.error")));
  }, []);
  useEffect(reload, [reload]);

  if (error !== null) return <p className="form-message form-message--error">{error}</p>;
  if (data === null) return <p>{t("common.loading")}</p>;
  const { kpis } = data;

  const tiles: Array<[string, string, string?]> = [
    [t("insights.accounts"), String(kpis.accounts), t("insights.accountsDetail", { verified: kpis.verifiedAccounts })],
    [t("insights.activeAccounts"), String(kpis.activeAccounts7d), t("insights.activeDetail", { month: kpis.activeAccounts30d })],
    [t("insights.games"), String(kpis.finishedGames), t("insights.gamesDetail", { aborted: kpis.abortedGames })],
    [t("insights.medianDuration"), kpis.medianMinutes === null ? "—" : `${kpis.medianMinutes} min`],
    [t("insights.replayRate"), percent(kpis.replayRate), t("insights.replayRateDetail")],
    [t("insights.accountSeats"), percent(kpis.accountSeatShare), t("insights.accountSeatsDetail")],
  ];
  const modeName = (mode: Mode) => t(`insights.mode_${mode}`);

  return (
    <div className="panel page-panel insights">
      <p className="field-hint">{t("insights.hint")}</p>
      <dl className="stat-tiles">
        {tiles.map(([label, value, detail]) => (
          <div key={label} className="stat-tile">
            <dt>{label}</dt>
            <dd className="stat-tile__value">{value}</dd>
            {detail !== undefined ? <dd className="stat-tile__detail">{detail}</dd> : null}
          </div>
        ))}
      </dl>

      <div className="chart-grid">
        <ChartFrame
          title={t("insights.gamesPerDay")}
          subtitle={t("insights.last30")}
          table={<ValuesTable head={[t("insights.day"), t("insights.finished"), t("insights.aborted")]} rows={data.gamesPerDay.map((entry) => [entry.day, entry.finished, entry.aborted])} />}
        >
          <Legend series={[{ name: t("insights.finished"), color: SERIES.blue }, { name: t("insights.aborted"), color: SERIES.gray }]} />
          <ColumnChart
            rows={data.gamesPerDay.map((entry) => ({ key: entry.day, label: shortDay(entry.day), values: [entry.finished, entry.aborted] }))}
            series={[{ name: t("insights.finished"), color: SERIES.blue }, { name: t("insights.aborted"), color: SERIES.gray }]}
            labelEvery={7}
          />
        </ChartFrame>

        <ChartFrame
          title={t("insights.playerCount")}
          subtitle={t("insights.finishedLast30")}
          table={<ValuesTable head={[t("insights.players"), t("insights.games")]} rows={data.byPlayerCount.map((entry) => [entry.players, entry.games])} />}
        >
          <ColumnChart rows={data.byPlayerCount.map((entry) => ({ key: String(entry.players), label: String(entry.players), values: [entry.games] }))} series={[{ name: t("insights.games"), color: SERIES.blue }]} />
        </ChartFrame>

        <ChartFrame
          title={t("insights.durationByPlayers")}
          subtitle={t("insights.durationSubtitle")}
          table={<ValuesTable head={[t("insights.players"), t("insights.medianDuration"), t("insights.games")]} rows={data.byPlayerCount.map((entry) => [entry.players, `${entry.medianMinutes} min`, entry.games])} />}
        >
          <ColumnChart
            rows={data.byPlayerCount.map((entry) => ({ key: String(entry.players), label: String(entry.players), values: [entry.medianMinutes], tooltip: t("insights.gamesCount", { count: entry.games }) }))}
            series={[{ name: t("insights.medianDuration"), color: SERIES.blue }]}
            format={(value) => `${Math.round(value)} min`}
          />
        </ChartFrame>

        <ChartFrame
          title={t("insights.naziWins")}
          subtitle={t("insights.naziWinsSubtitle")}
          table={<ValuesTable head={[t("insights.players"), t("insights.naziWinRate"), t("insights.games")]} rows={data.byPlayerCount.filter((entry) => entry.naziWinRate !== null).map((entry) => [entry.players, percent(entry.naziWinRate), entry.games])} />}
        >
          <ColumnChart
            rows={data.byPlayerCount
              .filter((entry) => entry.naziWinRate !== null)
              .map((entry) => ({ key: String(entry.players), label: String(entry.players), values: [entry.naziWinRate ?? 0], tooltip: t("insights.gamesCount", { count: entry.games }) }))}
            series={[{ name: t("insights.naziWinRate"), color: SERIES.blue }]}
            format={(value) => `${Math.round(value * 100)} %`}
            fixedMax={1}
            reference={{ value: 0.5, label: t("insights.balanced") }}
          />
        </ChartFrame>

        <ChartFrame
          title={t("insights.replayButton")}
          subtitle={t("insights.replaySubtitle", { replayed: data.replay.replayedGames, finished: data.replay.finishedGames })}
          table={<ValuesTable head={[t("insights.answer"), t("insights.players")]} rows={[[t("insights.replay"), data.replay.replay], [t("insights.quit"), data.replay.quit], [t("insights.noAnswer"), data.replay.none]]} />}
        >
          <ShareBar
            parts={[
              { name: t("insights.replay"), value: data.replay.replay, color: SERIES.blue },
              { name: t("insights.quit"), value: data.replay.quit, color: SERIES.orange },
              { name: t("insights.noAnswer"), value: data.replay.none, color: SERIES.gray },
            ]}
          />
        </ChartFrame>

        <ChartFrame title={t("insights.modes")} subtitle={t("insights.finishedLast30")} table={<ValuesTable head={[t("insights.mode"), t("insights.games")]} rows={data.modes.map((entry) => [modeName(entry.mode), entry.games])} />}>
          <ColumnChart rows={data.modes.map((entry) => ({ key: entry.mode, label: modeName(entry.mode), values: [entry.games] }))} series={[{ name: t("insights.games"), color: SERIES.blue }]} />
        </ChartFrame>

        <ChartFrame
          title={t("insights.signups")}
          subtitle={t("insights.last12Weeks")}
          table={<ValuesTable head={[t("insights.weekOf"), t("insights.signupsCount")]} rows={data.signupsPerWeek.map((entry) => [entry.week, entry.signups])} />}
        >
          <ColumnChart rows={data.signupsPerWeek.map((entry) => ({ key: entry.week, label: shortDay(entry.week), values: [entry.signups] }))} series={[{ name: t("insights.signupsCount"), color: SERIES.blue }]} labelEvery={3} />
        </ChartFrame>

        <ChartFrame title={t("insights.retention")} subtitle={t("insights.retentionSubtitle")}>
          {data.retention.length === 0 ? (
            <p className="chart__subtitle">{t("insights.noData")}</p>
          ) : (
            <div className="table-scroll">
              <table className="rules-table retention">
                <thead>
                  <tr>
                    <th>{t("insights.cohort")}</th>
                    <th>{t("insights.cohortSize")}</th>
                    {[0, 1, 2, 3, 4].map((week) => <th key={week}>{t("insights.weekN", { n: week })}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.retention.map((row) => (
                    <tr key={row.cohort}>
                      <td>{shortDay(row.cohort)}</td>
                      <td>{row.size}</td>
                      {row.weeks.map((share, week) => (
                        <td key={week} className="retention__cell" style={share === null ? undefined : heatColor(share)}>
                          {share === null ? "" : percent(share)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartFrame>
      </div>
      <button type="button" className="secondary" onClick={reload}>{t("common.refresh")}</button>
    </div>
  );
}
