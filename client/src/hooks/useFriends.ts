import { useCallback, useEffect, useState } from "react";

import { api } from "../api";
import type { FriendsView, PresenceStatus } from "../api";
import { SERVER_EVENTS } from "../events";
import { toRecord } from "../protocol";
import { socket } from "../socket";

const EMPTY: FriendsView = { friends: [], incoming: [], outgoing: [] };

/** Amis du compte connecté, tenus à jour en temps réel (demandes, présence). */
export function useFriends(enabled: boolean): { view: FriendsView; loading: boolean; refresh: () => Promise<void> } {
  const [view, setView] = useState<FriendsView>(EMPTY);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setView(EMPTY);
      return;
    }
    setLoading(true);
    try {
      setView(await api<FriendsView>("/friends"));
    } catch {
      // L'erreur est visible au prochain essai ; la liste garde son dernier état.
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    if (!enabled) {
      return;
    }
    const onChanged = (): void => void refresh();
    const onPresence = (payload: unknown): void => {
      const { userId, status } = toRecord(payload);
      if (typeof userId === "string" && (status === "online" || status === "in_game" || status === "offline")) {
        setView((current) => ({
          ...current,
          friends: current.friends.map((friend) => (friend.userId === userId ? { ...friend, status: status as PresenceStatus } : friend)),
        }));
      }
    };
    socket.on(SERVER_EVENTS.FRIEND_REQUEST, onChanged);
    socket.on(SERVER_EVENTS.FRIENDS_CHANGED, onChanged);
    socket.on(SERVER_EVENTS.FRIEND_PRESENCE, onPresence);
    return () => {
      socket.off(SERVER_EVENTS.FRIEND_REQUEST, onChanged);
      socket.off(SERVER_EVENTS.FRIENDS_CHANGED, onChanged);
      socket.off(SERVER_EVENTS.FRIEND_PRESENCE, onPresence);
    };
  }, [enabled, refresh]);

  return { view, loading, refresh };
}
