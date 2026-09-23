import { useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n";
import type { ChatMessage } from "../types";

type ChatPanelProps = {
  messages: ChatMessage[];
  myId: string | null;
  onSend: (text: string) => void;
  onReport: (message: ChatMessage) => void;
  /** Chat coupé par la modération jusqu'à cette date : on peut lire, pas écrire. */
  mutedUntil?: string | null;
};

/** Chat de room repliable, replié par défaut : il ne cache jamais les boutons de jeu. */
export function ChatPanel({ messages, myId, onSend, onReport, mutedUntil = null }: ChatPanelProps): JSX.Element {
  const { t, locale } = useI18n();
  const muted = mutedUntil !== null && new Date(mutedUntil) > new Date();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [seen, setSeen] = useState(messages.length);
  const listRef = useRef<HTMLOListElement | null>(null);
  const unread = open ? 0 : Math.max(0, messages.length - seen);

  useEffect(() => {
    if (open) {
      setSeen(messages.length);
      if (listRef.current !== null) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
  }, [open, messages.length]);

  if (!open) {
    return (
      <button type="button" className="chat-toggle" onClick={(event) => { event.stopPropagation(); setOpen(true); }} aria-label={t("chat.open")}>
        {t("chat.title")}{unread > 0 ? <span className="menu-badge">{unread}</span> : null}
      </button>
    );
  }

  return (
    <section className="chat-panel" aria-label={t("chat.label")} onClick={(event) => event.stopPropagation()}>
      <header className="chat-panel__header">
        <span className="mono">{t("chat.title")}</span>
        <button type="button" className="secondary chat-panel__close" onClick={() => setOpen(false)} aria-label={t("chat.close")}>▾</button>
      </header>
      <ol className="chat-panel__list" ref={listRef}>
        {messages.length === 0 ? <li className="chat-panel__empty">{t("chat.empty")}</li> : null}
        {messages.map((message) => (
          <li key={message.id} className={message.playerId === myId ? "chat-msg chat-msg--mine" : "chat-msg"}>
            <strong>{message.pseudo}</strong> <span>{message.text}</span>
            {message.playerId !== myId ? (
              <button type="button" className="chat-msg__report" title={t("chat.reportTitle")} aria-label={t("chat.reportLabel", { name: message.pseudo })} onClick={() => onReport(message)}>
                ⚑
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      <form
        className="chat-panel__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() !== "") {
            onSend(draft);
            setDraft("");
          }
        }}
      >
        <input
          value={draft}
          maxLength={200}
          disabled={muted}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={muted ? t("chat.mutedUntil", { date: new Date(mutedUntil as string).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) }) : t("chat.placeholder")}
          aria-label={t("chat.inputLabel")}
        />
        <button type="submit" disabled={muted || draft.trim() === ""}>{t("common.send")}</button>
      </form>
    </section>
  );
}
