import { useCallback, useEffect, useState } from "react";

import { api } from "../api";
import { useI18n } from "../i18n";

type PublicRoom = { code: string; host: string; players: number; minPlayers: number; maxPlayers: number };

/** Parties publiques ouvertes, réservées aux comptes (pour que la modération soit efficace). */
export function PublicRooms({ signedIn, onJoin }: { signedIn: boolean; onJoin: (code: string) => void }): JSX.Element {
  const { t } = useI18n();
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
        <span className="field-label">{t("publicRooms.title")}</span>
        <button type="button" className="link-button" onClick={refresh}>{t("common.refresh")}</button>
      </div>
      {!signedIn ? <p className="field-hint">{t("publicRooms.loginHint")}</p> : null}
      {rooms === null ? <p className="field-hint">{t("common.loading")}</p> : null}
      {rooms?.length === 0 ? <p className="field-hint">{t("publicRooms.empty")}</p> : null}
      <ul className="friend-list">
        {rooms?.map((room) => (
          <li key={room.code} className="friend-row">
            <span className="friend-row__name">
              {room.host} <span className="mono">· {room.players}/{room.maxPlayers}</span>
            </span>
            <button type="button" disabled={!signedIn} onClick={() => onJoin(room.code)}>{t("common.join")}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
