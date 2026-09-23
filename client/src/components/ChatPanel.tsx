import { useEffect, useRef, useState } from "react";

import type { ChatMessage } from "../types";

type ChatPanelProps = {
  messages: ChatMessage[];
  myId: string | null;
  onSend: (text: string) => void;
  onReport: (message: ChatMessage) => void;
};

/** Chat de room repliable, replié par défaut : il ne cache jamais les boutons de jeu. */
export function ChatPanel({ messages, myId, onSend, onReport }: ChatPanelProps): JSX.Element {
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
      <button type="button" className="chat-toggle" onClick={(event) => { event.stopPropagation(); setOpen(true); }} aria-label="Ouvrir le chat">
        Chat{unread > 0 ? <span className="menu-badge">{unread}</span> : null}
      </button>
    );
  }

  return (
    <section className="chat-panel" aria-label="Chat de la room" onClick={(event) => event.stopPropagation()}>
      <header className="chat-panel__header">
        <span className="mono">Chat</span>
        <button type="button" className="secondary chat-panel__close" onClick={() => setOpen(false)} aria-label="Replier le chat">▾</button>
      </header>
      <ol className="chat-panel__list" ref={listRef}>
        {messages.length === 0 ? <li className="chat-panel__empty">Aucun message.</li> : null}
        {messages.map((message) => (
          <li key={message.id} className={message.playerId === myId ? "chat-msg chat-msg--mine" : "chat-msg"}>
            <strong>{message.pseudo}</strong> <span>{message.text}</span>
            {message.playerId !== myId ? (
              <button type="button" className="chat-msg__report" title="Signaler ce message" aria-label={`Signaler le message de ${message.pseudo}`} onClick={() => onReport(message)}>
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
        <input value={draft} maxLength={200} onChange={(event) => setDraft(event.target.value)} placeholder="Message…" aria-label="Message" />
        <button type="submit" disabled={draft.trim() === ""}>Envoyer</button>
      </form>
    </section>
  );
}
