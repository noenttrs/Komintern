import { useCallback, useEffect, useState } from "react";

import { api } from "../api";

type PublicRoom = { code: string; host: string; players: number; minPlayers: number; maxPlayers: number };

/** Parties publiques ouvertes, réservées aux comptes (pour que la modération soit efficace). */
export function PublicRooms({ signedIn, onJoin }: { signedIn: boolean; onJoin: (code: string) => void }): JSX.Element {
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);

  const refresh = useCallback(() => {
    api<{ rooms: PublicRoom[] }>("/rooms/public")
      .then((result) => setRooms(result.rooms))
      .catch(() => setRooms([]));
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <section className="public-rooms">
      <div className="public-rooms__head">
        <span className="field-label">Parties publiques</span>
        <button type="button" className="link-button" onClick={refresh}>Actualiser</button>
      </div>
      {!signedIn ? <p className="field-hint">Connecte-toi (menu ☰) pour rejoindre une partie publique.</p> : null}
      {rooms === null ? <p className="field-hint">Chargement…</p> : null}
      {rooms?.length === 0 ? <p className="field-hint">Aucune partie publique ouverte pour l'instant.</p> : null}
      <ul className="friend-list">
        {rooms?.map((room) => (
          <li key={room.code} className="friend-row">
            <span className="friend-row__name">
              {room.host} <span className="mono">· {room.players}/{room.maxPlayers}</span>
            </span>
            <button type="button" disabled={!signedIn} onClick={() => onJoin(room.code)}>Rejoindre</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
