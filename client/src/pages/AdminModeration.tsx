import { useCallback, useEffect, useState } from "react";

import { api, ApiRequestError } from "../api";
import { translate, useI18n } from "../i18n";

// Onglets d'administration : comptes sanctionnés (avertissements, bannissements) et parties
// anonymes (ni pseudo, ni compte, ni message : l'identité passe par un dossier de modération).

type AdminUser = {
  id: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  bannedUntil: string | null;
  banReason: string | null;
  warnings: Array<{ id: string; at: string; reason: string; seen: boolean }>;
  gamesPlayed: number;
};

type AdminGame = {
  id: string;
  endedAt: string;
  durationSeconds: number;
  playerCount: number;
  accounts: number;
  mode: "missions" | "duel";
  format: string;
  outcome: "finished" | "aborted";
  winner: "nazi" | "communist" | null;
  reason: "missions" | "forfeit" | "duel" | null;
  duelWinners: number | null;
  missions: Array<"nazi" | "communist">;
  chatMessages: number;
  moderated: boolean;
};

const fmt = (date: string, locale: string): string => new Date(date).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });

function errorText(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : translate("common.error");
}

export function UsersTab(): JSX.Element {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const searching = query.trim().length >= 2;

  const load = useCallback(() => {
    const path = searching ? `/admin/users?q=${encodeURIComponent(query.trim())}` : "/admin/users?sanctioned=1";
    api<{ users: AdminUser[] }>(path)
      .then((result) => setUsers(result.users))
      .catch((error: unknown) => setMessage(errorText(error)));
  }, [query, searching]);
  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const act = (request: Promise<unknown>, done: string): void => {
    request.then(() => { setMessage(done); load(); }).catch((error: unknown) => setMessage(errorText(error)));
  };
  const warn = (user: AdminUser): void => {
    const reason = window.prompt(t("admin.warnPrompt", { name: user.displayName ?? user.email ?? "?" }));
    if (reason !== null && reason.trim() !== "") act(api(`/admin/users/${user.id}/warn`, { body: { reason } }), t("admin.warned"));
  };
  const ban = (user: AdminUser): void => {
    const days = window.prompt(t("admin.banPrompt", { name: user.displayName ?? user.email ?? "?" }), "7");
    if (days === null) return;
    const reason = Number(days) === 0 ? "" : window.prompt(t("admin.banReasonPrompt")) ?? "";
    act(api(`/admin/users/${user.id}/ban`, { body: { days: Number(days), reason } }), Number(days) === 0 ? t("admin.unbanned") : t("admin.bannedDays", { days }));
  };

  return (
    <div className="panel page-panel">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.searchUsers")} aria-label={t("admin.searchUsers")} />
      <p className="mono">{searching ? t("admin.searchResults") : t("admin.sanctionedList")}</p>
      {message !== null ? <p className="form-message" role="status">{message}</p> : null}
      {users?.length === 0 ? <p>{searching ? t("admin.noUsers") : t("admin.noSanctions")}</p> : null}
      <ul className="admin-users">
        {users?.map((user) => (
          <li key={user.id} className="admin-user">
            <div className="admin-user__head">
              <strong>{user.displayName ?? t("admin.noPseudo")}</strong>
              <span className="mono">{user.email ?? ""}</span>
              <span className="mono">{t("admin.userMeta", { date: fmt(user.createdAt, locale), games: user.gamesPlayed })}</span>
            </div>
            {user.bannedUntil !== null ? (
              <p className="admin-user__ban">{t("admin.bannedUntil", { date: fmt(user.bannedUntil, locale), reason: user.banReason ?? "" })}</p>
            ) : null}
            {user.warnings.length > 0 ? (
              <ul className="admin-user__warnings">
                {user.warnings.map((warning) => (
                  <li key={warning.id}>
                    <span className="mono">{fmt(warning.at, locale)}</span> {warning.reason} {warning.seen ? t("admin.warningSeen") : t("admin.warningUnseen")}
                    <button type="button" className="link-button" onClick={() => act(api(`/admin/users/${user.id}/warnings/${warning.id}`, { method: "DELETE" }), t("admin.warningRemoved"))}>
                      {t("admin.removeWarning")}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="admin-user__actions">
              <button type="button" className="secondary" onClick={() => warn(user)}>{t("admin.warn")}</button>
              {user.bannedUntil !== null ? (
                <button type="button" className="secondary" onClick={() => act(api(`/admin/users/${user.id}/ban`, { body: { days: 0 } }), t("admin.unbanned"))}>{t("admin.unban")}</button>
              ) : (
                <button type="button" className="secondary" onClick={() => ban(user)}>{t("admin.ban")}</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GamesTab(): JSX.Element {
  const { t, locale } = useI18n();
  const [games, setGames] = useState<AdminGame[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const more = useCallback((before?: string) => {
    api<{ games: AdminGame[] }>(`/admin/games${before === undefined ? "" : `?before=${encodeURIComponent(before)}`}`)
      .then((result) => {
        setGames((current) => (before === undefined ? result.games : [...current, ...result.games]));
        setDone(result.games.length < 50);
      })
      .catch((loadError: unknown) => setError(errorText(loadError)));
  }, []);
  useEffect(() => more(), [more]);

  const result = (game: AdminGame): string => {
    if (game.outcome === "aborted") return t("admin.gameAborted");
    if (game.mode === "duel") return game.reason === "forfeit" ? t("admin.duelForfeit") : t("admin.duelWinners", { count: game.duelWinners ?? 0 });
    const side = game.winner === "nazi" ? t("admin.winnerNazi") : t("admin.winnerCommunist");
    return game.reason === "forfeit" ? t("admin.byForfeit", { side }) : side;
  };

  return (
    <div className="panel page-panel">
      <p className="mono">{t("admin.gamesHint")}</p>
      {error !== null ? <p className="form-message form-message--error">{error}</p> : null}
      {games.length === 0 && error === null ? <p>{t("admin.noGames")}</p> : null}
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("admin.colDate")}</th>
              <th>{t("admin.colFormat")}</th>
              <th>{t("admin.colPlayers")}</th>
              <th>{t("admin.colDuration")}</th>
              <th>{t("admin.colResult")}</th>
              <th>{t("admin.colMissions")}</th>
              <th>{t("admin.colChat")}</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.id}>
                <td>{fmt(game.endedAt, locale)}</td>
                <td>{game.format}</td>
                <td>{t("admin.playersValue", { players: game.playerCount, accounts: game.accounts })}</td>
                <td>{Math.max(1, Math.round(game.durationSeconds / 60))} min</td>
                <td>{result(game)}{game.moderated ? " ⚑" : ""}</td>
                <td>
                  {game.missions.length === 0 ? (
                    "—"
                  ) : (
                    <span className="history-missions" aria-label={game.missions.map((mission) => (mission === "communist" ? "C" : "N")).join(" ")}>
                      {game.missions.map((mission, index) => <span key={index} className={mission === "communist" ? "dot" : "dot dot--full"} />)}
                    </span>
                  )}
                </td>
                <td>{game.chatMessages}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!done && games.length > 0 ? (
        <button type="button" className="secondary" onClick={() => more(games.at(-1)?.endedAt)}>{t("admin.moreGames")}</button>
      ) : null}
    </div>
  );
}
