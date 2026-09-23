import { useEffect, useState } from "react";

// Routeur minimal (History API) : les pages s'ouvrent en calque au-dessus de la partie.

export type Route =
  | { page: "game" }
  | { page: "auth" }
  | { page: "profile"; userId: string | null; setup: boolean }
  | { page: "friends" }
  | { page: "about" }
  | { page: "legal" };

export function parseRoute(pathname: string, search = ""): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/connexion") return { page: "auth" };
  if (path === "/amis") return { page: "friends" };
  if (path === "/a-propos") return { page: "about" };
  if (path === "/mentions-legales") return { page: "legal" };
  if (path === "/profil") return { page: "profile", userId: null, setup: new URLSearchParams(search).has("setup") };
  const friend = /^\/profil\/([A-Za-z0-9_-]{3,64})$/.exec(path);
  if (friend !== null) return { page: "profile", userId: friend[1] ?? null, setup: false };
  return { page: "game" };
}

const listeners = new Set<() => void>();

export function navigate(path: string): void {
  if (window.location.pathname + window.location.search !== path) {
    window.history.pushState({}, "", path);
  }
  listeners.forEach((listener) => listener());
}

export function useRoute(): Route {
  const read = (): Route => parseRoute(window.location.pathname, window.location.search);
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const update = (): void => setRoute(read());
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return route;
}
