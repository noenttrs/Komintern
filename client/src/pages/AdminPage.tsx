import { useCallback, useEffect, useState } from "react";

import { api, ApiRequestError } from "../api";
import { translate, useI18n } from "../i18n";
import { StaffGate } from "../components/StaffGate";
import { BanRequestsTab, GamesTab, ModeratorsTab, UsersTab } from "./AdminModeration";

type Stats = {
  users: { total: number; verified: number };
  games: {
    total: number;
    finished: number;
    aborted: number;
    last24h: number;
    last7d: number;
    winsNazi: number;
    winsCommunist: number;
    forfeits: number;
    openCases: number;
    totalCases: number;
  };
  live: { rooms: number; players: number; connectedPlayers: number; gamesInProgress: number };
  unreadContact: number;
};

type Report = {
  id: string;
  createdAt: string;
  status: "open" | "resolved";
  trigger: { type: "flagged_word"; words: string[]; categories?: string[] } | { type: "report"; reporter: string; reason: string };
  roomCode: string;
  messages: Array<{ pseudonym: string; text: string; at: string; flagged: boolean }>;
  resolution: string | null;
};

type Identity = { pseudonym: string; playerId: string; userId: string | null; pseudo: string; displayName: string | null; email: string | null };

type ContactMessage = { id: string; createdAt: string; email: string; subject: string; message: string; userId: string | null; read: boolean };

type Tab = "stats" | "audience" | "games" | "reports" | "banRequests" | "users" | "moderators" | "contact";

const TABS: Tab[] = ["stats", "audience", "games", "reports", "banRequests", "users", "moderators", "contact"];
const TAB_LABELS = {
  stats: "admin.tabStats",
  audience: "admin.tabAudience",
  games: "admin.tabGames",
  reports: "admin.tabReports",
  banRequests: "admin.tabBanRequests",
  users: "admin.tabUsers",
  moderators: "admin.tabModerators",
  contact: "admin.tabContact",
} as const;

const CATEGORY_KEYS = {
  racisme: "admin.catRacism",
  antisemitisme: "admin.catAntisemitism",
  homophobie: "admin.catHomophobia",
  validisme: "admin.catAbleism",
  menaces: "admin.catThreats",
  "incitation-au-suicide": "admin.catSuicide",
  "harcelement-sexuel": "admin.catSexual",
  "donnees-personnelles": "admin.catPersonalData",
} as const;

export function categoryLabel(category: string): string {
  const key = CATEGORY_KEYS[category as keyof typeof CATEGORY_KEYS];
  return key === undefined ? category : translate(key);
}

const fmt = (date: string, locale: string): string => new Date(date).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });

/** Administration : rôle admin (attribué côté serveur) + double authentification TOTP. */
export function AdminPage({ isAdmin }: { isAdmin: boolean }): JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("stats");
  return (
    <StaffGate base="/admin" title={t("admin.title")} allowed={isAdmin}>
      {() => (
        <>
          <div className="admin-tabs" role="tablist">
            {TABS.map((entry) => (
              <button key={entry} type="button" role="tab" aria-selected={tab === entry} className={tab === entry ? "" : "secondary"} onClick={() => setTab(entry)}>
                {t(TAB_LABELS[entry])}
              </button>
            ))}
          </div>
          {tab === "stats" ? <StatsTab /> : tab === "audience" ? <AudienceTab /> : tab === "games" ? <GamesTab /> : tab === "reports" ? <ReportsTab isAdmin /> : tab === "banRequests" ? <BanRequestsTab /> : tab === "users" ? <UsersTab isAdmin /> : tab === "moderators" ? <ModeratorsTab /> : <ContactTab />}
        </>
      )}
    </StaffGate>
  );
}

function useLoad<T>(path: string): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    api<T>(path)
      .then(setData)
      .catch((loadError: unknown) => setError(loadError instanceof ApiRequestError ? loadError.message : translate("common.error")));
  }, [path]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

function StatsTab(): JSX.Element {
  const { t } = useI18n();
  const { data, error, reload } = useLoad<Stats>("/admin/stats");
  if (error !== null) return <p className="form-message form-message--error">{error}</p>;
  if (data === null) return <p>{t("common.loading")}</p>;
  const { games } = data;
  const cells: Array<[string, string | number]> = [
    [t("admin.openRooms"), data.live.rooms],
    [t("admin.connectedPlayers"), data.live.connectedPlayers],
    [t("admin.gamesInProgress"), data.live.gamesInProgress],
    [t("admin.accounts"), t("admin.accountsValue", { total: data.users.total, verified: data.users.verified })],
    [t("admin.games24h"), games.last24h],
    [t("admin.games7d"), games.last7d],
    [t("admin.gamesTotal"), t("admin.gamesTotalValue", { finished: games.finished, aborted: games.aborted })],
    [t("admin.wins"), t("admin.winsValue", { nazi: games.winsNazi, communist: games.winsCommunist })],
    [t("admin.forfeits"), games.forfeits],
    [t("admin.openReports"), `${games.openCases} / ${games.totalCases}`],
    [t("admin.unreadMessages"), data.unreadContact],
  ];
  return (
    <div className="panel page-panel">
      <dl className="admin-stats">
        {cells.map(([label, value]) => (
          <div key={label} className="stat">
            <dt className="field-label">{label}</dt>
            <dd className="admin-stats__value">{value}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="secondary" onClick={reload}>{t("common.refresh")}</button>
    </div>
  );
}

type Audience = { daily: Array<{ day: string; visitors: number; pageviews: number }>; topPages: Array<{ path: string; views: number }> };

function AudienceTab(): JSX.Element {
  const { t } = useI18n();
  const { data, error } = useLoad<Audience>("/admin/audience");
  if (error !== null) return <p className="form-message form-message--error">{error}</p>;
  if (data === null) return <p>{t("common.loading")}</p>;
  const sum = (days: number, key: "visitors" | "pageviews") => data.daily.slice(-days).reduce((total, entry) => total + entry[key], 0);
  const max = Math.max(1, ...data.daily.map((entry) => entry.visitors));
  const cells: Array<[string, number]> = [
    [t("admin.visitorsToday"), data.daily.at(-1)?.visitors ?? 0],
    [t("admin.visitors7d"), sum(7, "visitors")],
    [t("admin.visitors30d"), sum(30, "visitors")],
    [t("admin.pageviews30d"), sum(30, "pageviews")],
  ];
  return (
    <div className="panel page-panel">
      <dl className="admin-stats">
        {cells.map(([label, value]) => (
          <div key={label} className="stat">
            <dt className="field-label">{label}</dt>
            <dd className="admin-stats__value">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="field-label">{t("admin.visitorsPerDay")}</h3>
      <div className="audience-chart" role="img" aria-label={t("admin.visitorsChart")}>
        {data.daily.map((entry) => (
          <span
            key={entry.day}
            className="audience-chart__bar"
            style={{ height: `${(entry.visitors / max) * 100}%` }}
            title={t("admin.visitorsBar", { day: entry.day, visitors: entry.visitors, views: entry.pageviews })}
          />
        ))}
      </div>
      <h3 className="field-label">{t("admin.topPages")}</h3>
      <ul className="friend-list">
        {data.topPages.map((page) => (
          <li key={page.path} className="friend-row">
            <span className="friend-row__name mono">{page.path}</span>
            <span>{page.views}</span>
          </li>
        ))}
      </ul>
      <p className="field-hint">{t("admin.audienceHint")}</p>
    </div>
  );
}

function ReportsTab({ isAdmin }: { isAdmin: boolean }): JSX.Element {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const { data, error, reload } = useLoad<{ reports: Report[] }>(`/admin/reports?status=${status}`);
  const [selected, setSelected] = useState<Report | null>(null);
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const open = (report: Report): void => {
    setIdentities(null);
    setMessage(null);
    api<{ case: Report }>(`/admin/reports/${report.id}`).then((result) => setSelected(result.case)).catch(() => setSelected(report));
  };

  if (selected !== null) {
    return (
      <div className="panel page-panel">
        <button type="button" className="secondary" onClick={() => { setSelected(null); reload(); }}>{t("admin.allReports")}</button>
        <p className="mono">
          {t("admin.reportMeta", {
            id: selected.id,
            room: selected.roomCode,
            date: fmt(selected.createdAt, locale),
            status: selected.status === "open" ? t("admin.statusOpen") : t("admin.statusClosed", { resolution: selected.resolution ?? "null" }),
          })}
        </p>
        <p>
          {selected.trigger.type === "flagged_word"
            ? `${t("admin.flaggedWords", { words: selected.trigger.words.join(", ") })}${selected.trigger.categories?.length ? ` · ${selected.trigger.categories.map(categoryLabel).join(", ")}` : ""}`
            : `${t("admin.reportedBy", { reporter: selected.trigger.reporter })}${selected.trigger.reason !== "" ? t("admin.reportReason", { reason: selected.trigger.reason }) : ""}`}
        </p>
        <ol className="admin-log">
          {selected.messages.map((entry, index) => (
            <li key={index} className={entry.flagged ? "admin-log__flagged" : ""}>
              <span className="mono">{new Date(entry.at).toLocaleTimeString(locale)}</span> <strong>{entry.pseudonym}</strong> {entry.text}
            </li>
          ))}
          {selected.messages.length === 0 ? <li>{t("admin.noMessages")}</li> : null}
        </ol>
        {identities === null ? (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (window.confirm(t("admin.revealConfirm"))) {
                api<{ identities: Identity[] }>(`/admin/reports/${selected.id}/reveal`, { body: {} }).then((result) => setIdentities(result.identities)).catch(() => undefined);
              }
            }}
          >
            {t("admin.reveal")}
          </button>
        ) : (
          <ul className="friend-list">
            {identities.map((identity) => (
              <li key={identity.pseudonym} className="friend-row">
                <span className="friend-row__name">
                  <strong>{identity.pseudonym}</strong> = {identity.pseudo}
                  {identity.userId === null ? t("admin.guest") : ` · ${identity.displayName ?? "?"} · ${identity.email ?? ""}`}
                </span>
                {identity.userId !== null ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const days = window.prompt(t(isAdmin ? "admin.banPrompt" : "admin.banPromptModerator", { name: identity.displayName ?? identity.pseudo }), "7");
                      const reason = days === null || Number(days) === 0 ? "" : window.prompt(t("admin.banReasonPrompt")) ?? "";
                      if (days !== null) {
                        api(`/admin/users/${identity.userId}/ban`, { body: { days: Number(days), reason } })
                          .then(() => setMessage(Number(days) === 0 ? t("admin.unbanned") : t("admin.bannedDays", { days })))
                          .catch((banError: unknown) => setMessage(banError instanceof Error ? banError.message : t("common.error")));
                      }
                    }}
                  >
                    {t("admin.ban")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {message !== null ? <p className="form-message">{message}</p> : null}
        {selected.status === "open" ? (
          <form
            className="form form--inline"
            onSubmit={(event) => {
              event.preventDefault();
              api(`/admin/reports/${selected.id}/resolve`, { body: { note } }).then(() => { setSelected(null); setNote(""); reload(); }).catch(() => undefined);
            }}
          >
            <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder={t("admin.decisionPlaceholder")} aria-label={t("admin.decision")} />
            <button type="submit">{t("admin.close")}</button>
          </form>
        ) : null}
      </div>
    );
  }

  return (
    <div className="panel page-panel">
      <div className="admin-tabs">
        <button type="button" className={status === "open" ? "" : "secondary"} onClick={() => setStatus("open")}>{t("admin.open")}</button>
        <button type="button" className={status === "resolved" ? "" : "secondary"} onClick={() => setStatus("resolved")}>{t("admin.closed")}</button>
      </div>
      {error !== null ? <p className="form-message form-message--error">{error}</p> : null}
      {data?.reports.length === 0 ? <p>{status === "open" ? t("admin.noOpenReports") : t("admin.noClosedReports")}</p> : null}
      <ul className="friend-list">
        {data?.reports.map((report) => (
          <li key={report.id} className="friend-row">
            <button type="button" className="link-button friend-row__name" onClick={() => open(report)}>
              {report.trigger.type === "flagged_word"
                ? `⚑ ${report.trigger.categories?.length ? `${report.trigger.categories.map(categoryLabel).join(", ")} · ` : ""}${report.trigger.words.join(", ")}`
                : t("admin.reportItem", { reason: report.trigger.reason || t("admin.noReason") })}
            </button>
            <span className="mono">{fmt(report.createdAt, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactTab(): JSX.Element {
  const { t, locale } = useI18n();
  const { data, error, reload } = useLoad<{ messages: ContactMessage[] }>("/admin/contact");
  const [openId, setOpenId] = useState<string | null>(null);
  if (error !== null) return <p className="form-message form-message--error">{error}</p>;
  return (
    <div className="panel page-panel">
      {data?.messages.length === 0 ? <p>{t("admin.noMessages")}</p> : null}
      <ul className="friend-list">
        {data?.messages.map((message) => (
          <li key={message.id} className="contact-item">
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setOpenId(openId === message.id ? null : message.id);
                if (!message.read) api(`/admin/contact/${message.id}/read`, { body: { read: true } }).then(reload).catch(() => undefined);
              }}
            >
              {message.read ? "" : "● "}<strong>{message.subject}</strong> — {message.email}
            </button>
            <span className="mono">{fmt(message.createdAt, locale)}</span>
            {openId === message.id ? (
              <>
                <p className="contact-item__body">{message.message}</p>
                <a className="button-link" href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}>{t("admin.reply")}</a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
