import { useCallback, useEffect, useState } from "react";

import { api, ApiRequestError } from "../api";
import { PageShell } from "../components/PageShell";

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
  trigger: { type: "flagged_word"; words: string[] } | { type: "report"; reporter: string; reason: string };
  roomCode: string;
  messages: Array<{ pseudonym: string; text: string; at: string; flagged: boolean }>;
  resolution: string | null;
};

type Identity = { pseudonym: string; playerId: string; userId: string | null; pseudo: string; displayName: string | null; email: string | null };

type ContactMessage = { id: string; createdAt: string; email: string; subject: string; message: string; userId: string | null; read: boolean };

type Tab = "stats" | "audience" | "reports" | "contact";

const fmt = (date: string): string => new Date(date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Administration : rôle admin (attribué côté serveur) + double authentification TOTP. */
export function AdminPage({ isAdmin }: { isAdmin: boolean }): JSX.Element {
  const [elevated, setElevated] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [tab, setTab] = useState<Tab>("stats");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    api<{ elevated: boolean }>("/admin/session")
      .then((result) => setElevated(result.elevated))
      .catch(() => setElevated(false));
  }, [isAdmin]);

  if (!isAdmin) {
    return <PageShell title="Page introuvable"><p>Cette page n'existe pas.</p></PageShell>;
  }

  if (elevated !== true) {
    return (
      <PageShell title="Administration">
        <div className="panel page-panel">
          <p>Saisis le code à 6 chiffres de ton application d'authentification.</p>
          {error !== null ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              api("/admin/session", { body: { code } })
                .then(() => setElevated(true))
                .catch((submitError: unknown) => setError(submitError instanceof Error ? submitError.message : "Erreur"))
                .finally(() => setCode(""));
            }}
          >
            <label className="field">
              <span className="field-label">Code de double authentification</span>
              <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
            </label>
            <button type="submit" disabled={elevated === null}>Valider</button>
          </form>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Administration">
      <div className="admin-tabs" role="tablist">
        {(["stats", "audience", "reports", "contact"] as const).map((entry) => (
          <button key={entry} type="button" role="tab" aria-selected={tab === entry} className={tab === entry ? "" : "secondary"} onClick={() => setTab(entry)}>
            {entry === "stats" ? "Statistiques" : entry === "audience" ? "Audience" : entry === "reports" ? "Signalements" : "Contact"}
          </button>
        ))}
      </div>
      {tab === "stats" ? <StatsTab /> : tab === "audience" ? <AudienceTab /> : tab === "reports" ? <ReportsTab /> : <ContactTab />}
    </PageShell>
  );
}

function useLoad<T>(path: string): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    api<T>(path)
      .then(setData)
      .catch((loadError: unknown) => setError(loadError instanceof ApiRequestError ? loadError.message : "Erreur"));
  }, [path]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

function StatsTab(): JSX.Element {
  const { data, error, reload } = useLoad<Stats>("/admin/stats");
  if (error !== null) return <p className="form-message form-message--error">{error}</p>;
  if (data === null) return <p>Chargement…</p>;
  const { games } = data;
  const cells: Array<[string, string | number]> = [
    ["Rooms ouvertes", data.live.rooms],
    ["Joueurs connectés", data.live.connectedPlayers],
    ["Parties en cours", data.live.gamesInProgress],
    ["Comptes", `${data.users.total} (${data.users.verified} validés)`],
    ["Parties (24 h)", games.last24h],
    ["Parties (7 j)", games.last7d],
    ["Parties au total", `${games.finished} finies · ${games.aborted} annulées`],
    ["Victoires", `${games.winsNazi} nazi · ${games.winsCommunist} communiste`],
    ["Abandons", games.forfeits],
    ["Signalements ouverts", `${games.openCases} / ${games.totalCases}`],
    ["Messages non lus", data.unreadContact],
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
      <button type="button" className="secondary" onClick={reload}>Actualiser</button>
    </div>
  );
}

type Audience = { daily: Array<{ day: string; visitors: number; pageviews: number }>; topPages: Array<{ path: string; views: number }> };

function AudienceTab(): JSX.Element {
  const { data, error } = useLoad<Audience>("/admin/audience");
  if (error !== null) return <p className="form-message form-message--error">{error}</p>;
  if (data === null) return <p>Chargement…</p>;
  const sum = (days: number, key: "visitors" | "pageviews") => data.daily.slice(-days).reduce((total, entry) => total + entry[key], 0);
  const max = Math.max(1, ...data.daily.map((entry) => entry.visitors));
  const cells: Array<[string, number]> = [
    ["Visiteurs aujourd'hui", data.daily.at(-1)?.visitors ?? 0],
    ["Visiteurs (7 j, cumul)", sum(7, "visitors")],
    ["Visiteurs (30 j, cumul)", sum(30, "visitors")],
    ["Pages vues (30 j)", sum(30, "pageviews")],
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
      <h3 className="field-label">Visiteurs par jour (30 jours)</h3>
      <div className="audience-chart" role="img" aria-label="Visiteurs par jour sur 30 jours">
        {data.daily.map((entry) => (
          <span
            key={entry.day}
            className="audience-chart__bar"
            style={{ height: `${(entry.visitors / max) * 100}%` }}
            title={`${entry.day} : ${entry.visitors} visiteurs, ${entry.pageviews} pages vues`}
          />
        ))}
      </div>
      <h3 className="field-label">Pages les plus vues (30 jours)</h3>
      <ul className="friend-list">
        {data.topPages.map((page) => (
          <li key={page.path} className="friend-row">
            <span className="friend-row__name mono">{page.path}</span>
            <span>{page.views}</span>
          </li>
        ))}
      </ul>
      <p className="field-hint">Mesure anonyme sans cookie. Les visiteurs sont comptés par jour : les cumuls comptent plusieurs fois un visiteur revenu plusieurs jours.</p>
    </div>
  );
}

function ReportsTab(): JSX.Element {
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
        <button type="button" className="secondary" onClick={() => { setSelected(null); reload(); }}>← Tous les signalements</button>
        <p className="mono">{selected.id} · room {selected.roomCode} · {fmt(selected.createdAt)} · {selected.status === "open" ? "ouvert" : `clos : ${selected.resolution}`}</p>
        <p>
          {selected.trigger.type === "flagged_word"
            ? `Mots signalés : ${selected.trigger.words.join(", ")}`
            : `Signalé par ${selected.trigger.reporter}${selected.trigger.reason !== "" ? ` : « ${selected.trigger.reason} »` : ""}`}
        </p>
        <ol className="admin-log">
          {selected.messages.map((entry, index) => (
            <li key={index} className={entry.flagged ? "admin-log__flagged" : ""}>
              <span className="mono">{new Date(entry.at).toLocaleTimeString("fr-FR")}</span> <strong>{entry.pseudonym}</strong> {entry.text}
            </li>
          ))}
          {selected.messages.length === 0 ? <li>Aucun message.</li> : null}
        </ol>
        {identities === null ? (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (window.confirm("Lever l'anonymat de ce dossier ? L'accès est tracé.")) {
                api<{ identities: Identity[] }>(`/admin/reports/${selected.id}/reveal`, { body: {} }).then((result) => setIdentities(result.identities)).catch(() => undefined);
              }
            }}
          >
            Lever l'anonymat (tracé)
          </button>
        ) : (
          <ul className="friend-list">
            {identities.map((identity) => (
              <li key={identity.pseudonym} className="friend-row">
                <span className="friend-row__name">
                  <strong>{identity.pseudonym}</strong> = {identity.pseudo}
                  {identity.userId === null ? " (invité)" : ` · ${identity.displayName ?? "?"} · ${identity.email ?? ""}`}
                </span>
                {identity.userId !== null ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const days = window.prompt(`Bannir ${identity.displayName ?? identity.pseudo} combien de jours ? (0 = lever)`, "7");
                      if (days !== null) {
                        api(`/admin/users/${identity.userId}/ban`, { body: { days: Number(days) } })
                          .then(() => setMessage(Number(days) === 0 ? "Bannissement levé." : `Banni ${days} jours.`))
                          .catch((banError: unknown) => setMessage(banError instanceof Error ? banError.message : "Erreur"));
                      }
                    }}
                  >
                    Bannir
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
            <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Décision (avertissement, ban…)" aria-label="Décision" />
            <button type="submit">Clore</button>
          </form>
        ) : null}
      </div>
    );
  }

  return (
    <div className="panel page-panel">
      <div className="admin-tabs">
        <button type="button" className={status === "open" ? "" : "secondary"} onClick={() => setStatus("open")}>Ouverts</button>
        <button type="button" className={status === "resolved" ? "" : "secondary"} onClick={() => setStatus("resolved")}>Clos</button>
      </div>
      {error !== null ? <p className="form-message form-message--error">{error}</p> : null}
      {data?.reports.length === 0 ? <p>Aucun signalement {status === "open" ? "ouvert" : "clos"}.</p> : null}
      <ul className="friend-list">
        {data?.reports.map((report) => (
          <li key={report.id} className="friend-row">
            <button type="button" className="link-button friend-row__name" onClick={() => open(report)}>
              {report.trigger.type === "flagged_word" ? `⚑ ${report.trigger.words.join(", ")}` : `Signalement : ${report.trigger.reason || "sans motif"}`}
            </button>
            <span className="mono">{fmt(report.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactTab(): JSX.Element {
  const { data, error, reload } = useLoad<{ messages: ContactMessage[] }>("/admin/contact");
  const [openId, setOpenId] = useState<string | null>(null);
  if (error !== null) return <p className="form-message form-message--error">{error}</p>;
  return (
    <div className="panel page-panel">
      {data?.messages.length === 0 ? <p>Aucun message.</p> : null}
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
            <span className="mono">{fmt(message.createdAt)}</span>
            {openId === message.id ? (
              <>
                <p className="contact-item__body">{message.message}</p>
                <a className="button-link" href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}>Répondre par email</a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
