// Bannière de soutien Ko-fi : règles d'affichage, entièrement côté client.
// Aucune donnée n'est envoyée au serveur ; sans stockage disponible, la bannière ne s'affiche pas.
import type { UIPhase } from "./types";

export const KOFI_URL = "https://ko-fi.com/komintern";
const STORAGE_KEY = "komintern.support_banner";
const DAY_MS = 24 * 3600 * 1000;

/** Nombre de parties terminées avant la première apparition. */
export const MIN_FINISHED_GAMES = 3;
/** Délai minimal entre deux apparitions, et durées de masquage selon l'action. */
export const SHOW_EVERY_MS = 7 * DAY_MS;
export const HIDE_MS = { close: 7 * DAY_MS, kofi: 30 * DAY_MS, donated: 90 * DAY_MS } as const;

export type DismissReason = keyof typeof HIDE_MS;

type BannerState = {
  finishedGames: number;
  /** Dernière apparition (début de la période de 7 jours). */
  lastShownAt: number | null;
  hiddenUntil: number | null;
};

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Écrans où la bannière peut apparaître : accueil et salle d'attente, jamais en partie. */
const ALLOWED_PHASES: UIPhase[] = ["landing", "waiting_room"];

/** Stockage local utilisable, ou null (navigation privée stricte, stockage bloqué…). */
export function availableStorage(): KeyValueStorage | null {
  try {
    const storage = window.localStorage;
    const probe = "komintern.storage_probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function read(storage: KeyValueStorage): BannerState {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") as Partial<BannerState>;
    return {
      finishedGames: typeof parsed.finishedGames === "number" ? parsed.finishedGames : 0,
      lastShownAt: typeof parsed.lastShownAt === "number" ? parsed.lastShownAt : null,
      hiddenUntil: typeof parsed.hiddenUntil === "number" ? parsed.hiddenUntil : null,
    };
  } catch {
    return { finishedGames: 0, lastShownAt: null, hiddenUntil: null };
  }
}

function write(storage: KeyValueStorage, state: BannerState): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota plein ou stockage retiré : on ignore, la bannière restera simplement cachée.
  }
}

/** Une partie vient de se terminer dans ce navigateur. */
export function recordFinishedGame(storage: KeyValueStorage | null): void {
  if (storage === null) return;
  const state = read(storage);
  write(storage, { ...state, finishedGames: state.finishedGames + 1 });
}

/**
 * La bannière doit-elle être visible ? `shownThisVisit` : elle a déjà été affichée pendant cette
 * visite (elle reste alors visible jusqu'à ce qu'on la ferme, sans compter une nouvelle apparition).
 */
export function shouldShowBanner(input: {
  storage: KeyValueStorage | null;
  phase: UIPhase;
  onGameScreen: boolean;
  now: number;
  shownThisVisit: boolean;
}): boolean {
  if (input.storage === null || !input.onGameScreen || !ALLOWED_PHASES.includes(input.phase)) return false;
  const state = read(input.storage);
  if (state.finishedGames < MIN_FINISHED_GAMES) return false;
  if (state.hiddenUntil !== null && input.now < state.hiddenUntil) return false;
  if (input.shownThisVisit) return true;
  return state.lastShownAt === null || input.now - state.lastShownAt >= SHOW_EVERY_MS;
}

/** À appeler quand la bannière apparaît : ouvre une période de 7 jours sans nouvelle apparition. */
export function markBannerShown(storage: KeyValueStorage | null, now: number): void {
  if (storage === null) return;
  write(storage, { ...read(storage), lastShownAt: now });
}

export function dismissBanner(storage: KeyValueStorage | null, reason: DismissReason, now: number): void {
  if (storage === null) return;
  write(storage, { ...read(storage), hiddenUntil: now + HIDE_MS[reason] });
}
