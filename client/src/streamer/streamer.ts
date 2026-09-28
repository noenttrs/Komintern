// Mode streamer : préférence locale (ce navigateur). La fenêtre du jeu, celle que capture OBS,
// n'affiche alors plus aucun secret ; rôle, alliés et code passent dans une fenêtre privée.
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "komintern.streamer";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let current = typeof window === "undefined" ? false : read();

/** Proposé seulement sur ordinateur : souris et grand écran (on ne streame pas depuis un téléphone). */
export function streamerCapable(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: fine) and (min-width: 1024px)").matches === true;
}

export function setStreamerMode(enabled: boolean): void {
  current = enabled;
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Stockage indisponible : réglage valable pour cette visite.
  }
  listeners.forEach((listener) => listener());
}

export function useStreamerMode(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => false,
  );
  return [enabled, setStreamerMode];
}

/** Ouvre (ou ramène) la fenêtre privée, petite et séparée de la fenêtre capturée. */
export function openPrivateWindow(): void {
  window.open("/prive", "komintern-prive", "popup,width=380,height=560");
}
