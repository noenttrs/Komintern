import { useCallback, useEffect, useState } from "react";

import { api, ApiRequestError } from "../api";
import { StaffGate } from "../components/StaffGate";
import { translate, useI18n } from "../i18n";
import { categoryLabel } from "./AdminPage";

// Panel de modération : conversations signalées, anonymisées. Le modérateur choisit une
// conséquence pour « Joueur A, B… » ; le serveur l'applique à la bonne personne sans la révéler.

type Case = {
  id: string;
  createdAt: string;
  status: "open" | "resolved";
  trigger: { type: "flagged_word"; words: string[]; categories?: string[] } | { type: "report"; reporter: string; reason: string };
  messages: Array<{ pseudonym: string; text: string; at: string; flagged: boolean }>;
  resolution: string | null;
};

type Participant = { pseudonym: string; kind: "account" | "guest"; priorSanctions: number; restriction: "banned" | "muted" | null };

type Detail = {
  case: Case;
  participants: Participant[];
  banRequests: Array<{ id: string; pseudonym: string; status: "pending" | "accepted" | "rejected" }>;
  audit: Array<{ action: string; at: string; detail?: string; actor?: string }>;
};

type SanctionChoice = { type: "warn" | "mute" | "chat_ban" | "ban_request"; duration?: number; label: string };

const fmt = (date: string, locale: string): string => new Date(date).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });

function errorText(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : translate("common.error");
}

function triggerText(trigger: Case["trigger"]): string {
  if (trigger.type === "report") return translate("moderation.reportTrigger", { reporter: trigger.reporter, reason: trigger.reason || translate("admin.noReason") });
  const categories = trigger.categories?.length ? `${trigger.categories.map(categoryLabel).join(", ")} · ` : "";
  return `⚑ ${categories}${trigger.words.join(", ")}`;
}

export function ModerationPage({ isStaff }: { isStaff: boolean }): JSX.Element {
  const { t } = useI18n();
  return (
    <StaffGate base="/moderation" title={t("moderation.title")} allowed={isStaff}>
      {() => <Cases />}
    </StaffGate>
  );
}

function Cases(): JSX.Element {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [cases, setCases] = useState<Case[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ cases: Case[] }>(`/moderation/cases?status=${status}`)
      .then((result) => setCases(result.cases))
      .catch((loadError: unknown) => setError(errorText(loadError)));
  }, [status]);
  useEffect(load, [load]);

  if (openId !== null) {
    return <CaseDetail id={openId} onBack={() => { setOpenId(null); load(); }} />;
  }
  return (
    <div className="panel page-panel">
      <p className="mono">{t("moderation.hint")}</p>
      <div className="admin-tabs">
        <button type="button" className={status === "open" ? "" : "secondary"} onClick={() => setStatus("open")}>{t("admin.open")}</button>
        <button type="button" className={status === "resolved" ? "" : "secondary"} onClick={() => setStatus("resolved")}>{t("admin.closed")}</button>
      </div>
      {error !== null ? <p className="form-message form-message--error">{error}</p> : null}
      {cases?.length === 0 ? <p>{status === "open" ? t("admin.noOpenReports") : t("admin.noClosedReports")}</p> : null}
      <ul className="friend-list">
        {cases?.map((entry) => (
          <li key={entry.id} className="friend-row">
            <button type="button" className="link-button friend-row__name" onClick={() => setOpenId(entry.id)}>{triggerText(entry.trigger)}</button>
            <span className="mono">{fmt(entry.createdAt, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CaseDetail({ id, onBack }: { id: string; onBack: () => void }): JSX.Element {
  const { t, locale } = useI18n();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const load = useCallback(() => {
    api<Detail>(`/moderation/cases/${id}`).then(setDetail).catch((error: unknown) => setMessage(errorText(error)));
  }, [id]);
  useEffect(load, [load]);

  const choices: SanctionChoice[] = [
    { type: "warn", label: t("moderation.warn") },
    { type: "mute", duration: 1, label: t("moderation.mute1h") },
    { type: "mute", duration: 24, label: t("moderation.mute24h") },
    { type: "chat_ban", duration: 7, label: t("moderation.chatBan7") },
    { type: "chat_ban", duration: 30, label: t("moderation.chatBan30") },
    { type: "ban_request", label: t("moderation.banRequest") },
  ];

  const apply = (participant: Participant, choice: SanctionChoice): void => {
    const reason = window.prompt(t("moderation.reasonPrompt", { action: choice.label, pseudonym: participant.pseudonym }));
    if (reason === null || reason.trim() === "") return;
    api(`/moderation/cases/${id}/sanction`, { body: { pseudonym: participant.pseudonym, type: choice.type, duration: choice.duration, reason } })
      .then(() => {
        setMessage(choice.type === "ban_request" ? t("moderation.requestSent") : t("moderation.applied", { action: choice.label, pseudonym: participant.pseudonym }));
        load();
      })
      .catch((error: unknown) => setMessage(errorText(error)));
  };

  if (detail === null) {
    return (
      <div className="panel page-panel">
        <button type="button" className="secondary" onClick={onBack}>{t("moderation.back")}</button>
        {message !== null ? <p className="form-message form-message--error">{message}</p> : null}
      </div>
    );
  }
  const { case: moderationCase, participants, banRequests, audit } = detail;
  return (
    <div className="moderation-case">
      <div className="panel page-panel">
        <button type="button" className="secondary" onClick={onBack}>{t("moderation.back")}</button>
        <p className="mono">{fmt(moderationCase.createdAt, locale)} · {moderationCase.status === "open" ? t("admin.statusOpen") : t("admin.statusClosed", { resolution: moderationCase.resolution ?? "" })}</p>
        <p>{triggerText(moderationCase.trigger)}</p>
        <ol className="admin-log">
          {moderationCase.messages.map((entry, index) => (
            <li key={index} className={entry.flagged ? "admin-log__flagged" : ""}>
              <span className="mono">{new Date(entry.at).toLocaleTimeString(locale)}</span> <strong>{entry.pseudonym}</strong> {entry.text}
            </li>
          ))}
          {moderationCase.messages.length === 0 ? <li>{t("admin.noMessages")}</li> : null}
        </ol>
      </div>

      <div className="panel page-panel">
        <h2>{t("moderation.participants")}</h2>
        {message !== null ? <p className="form-message" role="status">{message}</p> : null}
        <ul className="admin-users">
          {participants.map((participant) => {
            const pending = banRequests.some((request) => request.pseudonym === participant.pseudonym && request.status === "pending");
            return (
              <li key={participant.pseudonym} className="admin-user">
                <div className="admin-user__head">
                  <strong>{participant.pseudonym}</strong>
                  <span className="mono">{participant.kind === "account" ? t("moderation.account") : t("moderation.guest")}</span>
                  {participant.priorSanctions > 0 ? <span className="mono">{t("moderation.prior", { count: participant.priorSanctions })}</span> : null}
                  {participant.restriction !== null ? <span className="mono">{participant.restriction === "banned" ? t("moderation.isBanned") : t("moderation.isMuted")}</span> : null}
                  {pending ? <span className="mono">{t("moderation.requestPending")}</span> : null}
                </div>
                {participant.kind === "account" ? (
                  <div className="admin-user__actions">
                    {choices.map((choice) => (
                      <button key={`${choice.type}-${choice.duration ?? 0}`} type="button" className="secondary" disabled={choice.type === "ban_request" && pending} onClick={() => apply(participant, choice)}>
                        {choice.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mono">{t("moderation.guestHint")}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="panel page-panel">
        {moderationCase.status === "open" ? (
          <form
            className="form form--inline"
            onSubmit={(event) => {
              event.preventDefault();
              api(`/moderation/cases/${id}/resolve`, { body: { note } }).then(onBack).catch((error: unknown) => setMessage(errorText(error)));
            }}
          >
            <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder={t("moderation.notePlaceholder")} aria-label={t("admin.decision")} />
            <button type="submit">{t("admin.close")}</button>
          </form>
        ) : null}
        <details>
          <summary>{t("moderation.history", { count: audit.length })}</summary>
          <ul className="admin-user__warnings">
            {audit.map((entry, index) => (
              <li key={index}>
                <span className="mono">{fmt(entry.at, locale)}</span> {entry.action} {entry.detail ?? ""} {entry.actor !== undefined ? `· ${entry.actor}` : ""}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
