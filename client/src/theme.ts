// Thème clair / sombre : « auto » suit le réglage du système. Le choix est gardé dans le navigateur
// (préférence d'affichage, rien d'autre) et posé sur <html data-theme> avant le premier rendu.
import { useSyncExternalStore } from "react";

export type ThemeChoice = "auto" | "light" | "dark";

const STORAGE_KEY = "komintern.theme";
const listeners = new Set<() => void>();

function readStored(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
}

let current: ThemeChoice = typeof window === "undefined" ? "auto" : readStored();

/** Couleur de la barre du navigateur (PWA) accordée au fond réellement affiché. */
function syncThemeColor(): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  const background = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (meta !== null && background !== "") meta.setAttribute("content", background);
}

export function applyTheme(choice: ThemeChoice = current): void {
  if (typeof document === "undefined") return;
  if (choice === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  syncThemeColor();
}

export function setTheme(choice: ThemeChoice): void {
  current = choice;
  try {
    if (choice === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Stockage indisponible : le choix vaut pour cette visite.
  }
  applyTheme(choice);
  listeners.forEach((listener) => listener());
}

/** À appeler une fois au démarrage : applique le choix et suit les changements du système. */
export function initTheme(): void {
  applyTheme();
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (current === "auto") syncThemeColor();
  });
}

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => "auto" as ThemeChoice,
  );
  return [choice, setTheme];
}
