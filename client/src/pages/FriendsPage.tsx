import { useState } from "react";

import { api } from "../api";
import type { FriendsView, PresenceStatus } from "../api";
import { PageShell } from "../components/PageShell";
import { navigate } from "../router";

type FriendsPageProps = {
  signedIn: boolean;
  view: FriendsView;
  refresh: () => Promise<void>;
  canInvite: boolean;
  onInvite: (userId: string) => void;
};

const STATUS_LABEL: Record<PresenceStatus, string> = { online: "en ligne", in_game: "en partie", offline: "hors ligne" };

export function FriendsPage({ signedIn, view, refresh, canInvite, onInvite }: FriendsPageProps): JSX.Element {
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  if (!signedIn) {
    return (
      <PageShell title="Amis">
        <div className="panel page-panel">
          <p>Connecte-toi pour ajouter des amis, voir qui est en ligne et les inviter dans ta room.</p>
          <button type="button" onClick={() => navigate("/connexion")}>Se connecter</button>
        </div>
      </PageShell>
    );
  }

  const act = async (action: () => Promise<unknown>, success?: string): Promise<void> => {
    setMessage(null);
    try {
      await action();
      if (success !== undefined) setMessage({ text: success, error: false });
      await refresh();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Erreur", error: true });
    }
  };

  return (
    <PageShell title="Amis">
      <div className="panel page-panel">
        {message !== null ? <p className={message.error ? "form-message form-message--error" : "form-message"} role="alert">{message.text}</p> : null}
        <form
          className="form form--inline"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              const { status } = await api<{ status: string }>("/friends/requests", { body: { displayName: name } });
              setName("");
              setMessage({ text: status === "accepted" ? "Vous êtes maintenant amis." : "Demande envoyée.", error: false });
            });
          }}
        >
          <input required minLength={3} maxLength={20} value={name} onChange={(event) => setName(event.target.value)} placeholder="Pseudo d'un joueur" aria-label="Pseudo à ajouter" />
          <button type="submit">Ajouter</button>
        </form>

        {view.incoming.length > 0 ? (
          <section className="friends-section">
            <h3 className="field-label">Demandes reçues</h3>
            <ul className="friend-list">
              {view.incoming.map((request) => (
                <li key={request.userId} className="friend-row">
                  <span className="friend-row__name">{request.displayName}</span>
                  <button type="button" onClick={() => void act(() => api(`/friends/${request.userId}/accept`, { body: {} }))}>Accepter</button>
                  <button type="button" className="secondary" onClick={() => void act(() => api(`/friends/${request.userId}`, { method: "DELETE" }))}>Refuser</button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="friends-section">
          <h3 className="field-label">Amis ({view.friends.length})</h3>
          {view.friends.length === 0 ? <p>Pas encore d'amis. Ajoute-les avec leur pseudo.</p> : null}
          <ul className="friend-list">
            {view.friends.map((friend) => (
              <li key={friend.userId} className="friend-row">
                <span className={`presence presence--${friend.status}`} aria-hidden="true" />
                <button type="button" className="link-button friend-row__name" onClick={() => navigate(`/profil/${friend.userId}`)}>
                  {friend.displayName}
                </button>
                <span className="mono">{STATUS_LABEL[friend.status]}</span>
                {canInvite && friend.status === "online" ? (
                  <button type="button" onClick={() => onInvite(friend.userId)}>Inviter</button>
                ) : null}
                <button
                  type="button"
                  className="secondary friend-row__remove"
                  aria-label={`Retirer ${friend.displayName}`}
                  onClick={() => {
                    if (window.confirm(`Retirer ${friend.displayName} de tes amis ?`)) {
                      void act(() => api(`/friends/${friend.userId}`, { method: "DELETE" }));
                    }
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>

        {view.outgoing.length > 0 ? (
          <section className="friends-section">
            <h3 className="field-label">Demandes envoyées</h3>
            <ul className="friend-list">
              {view.outgoing.map((request) => (
                <li key={request.userId} className="friend-row">
                  <span className="friend-row__name">{request.displayName}</span>
                  <button type="button" className="secondary" onClick={() => void act(() => api(`/friends/${request.userId}`, { method: "DELETE" }))}>Annuler</button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {!canInvite ? <p className="mono">Pour inviter un ami, crée ou rejoins d'abord une room.</p> : null}
      </div>
    </PageShell>
  );
}
