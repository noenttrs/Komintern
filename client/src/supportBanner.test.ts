import { describe, expect, it } from "vitest";

import {
  HIDE_MS,
  MIN_FINISHED_GAMES,
  SHOW_EVERY_MS,
  dismissBanner,
  markBannerShown,
  recordFinishedGame,
  shouldShowBanner,
} from "./supportBanner";
import type { KeyValueStorage } from "./supportBanner";
import type { UIPhase } from "./types";

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

const NOW = 1_800_000_000_000;
const show = (storage: KeyValueStorage | null, phase: UIPhase = "landing", now = NOW, extra: Partial<{ onGameScreen: boolean; shownThisVisit: boolean }> = {}) =>
  shouldShowBanner({ storage, phase, now, onGameScreen: true, shownThisVisit: false, ...extra });

function withGames(count: number): KeyValueStorage {
  const storage = memoryStorage();
  for (let index = 0; index < count; index += 1) recordFinishedGame(storage);
  return storage;
}

describe("support banner rules", () => {
  it("appears only after 3 finished games", () => {
    expect(show(withGames(MIN_FINISHED_GAMES - 1))).toBe(false);
    expect(show(withGames(MIN_FINISHED_GAMES))).toBe(true);
  });

  it("only on the home screen and the lobby, never during a game or over a page", () => {
    const storage = withGames(3);
    expect(show(storage, "landing")).toBe(true);
    expect(show(storage, "waiting_room")).toBe(true);
    for (const phase of ["table_order", "role_reveal", "mission_proposal", "confidence_vote", "mission_execution", "mission_result", "end_game", "replay_waiting", "create_room"] as UIPhase[]) {
      expect(show(storage, phase)).toBe(false);
    }
    expect(show(storage, "landing", NOW, { onGameScreen: false })).toBe(false);
  });

  it("appears at most once every 7 days, but stays during the visit it appeared in", () => {
    const storage = withGames(3);
    markBannerShown(storage, NOW);
    expect(show(storage, "landing", NOW + 1000, { shownThisVisit: true })).toBe(true);
    expect(show(storage, "landing", NOW + SHOW_EVERY_MS - 1)).toBe(false);
    expect(show(storage, "landing", NOW + SHOW_EVERY_MS)).toBe(true);
  });

  it("hides for 7, 30 or 90 days depending on the action", () => {
    for (const [reason, duration] of Object.entries(HIDE_MS) as Array<[keyof typeof HIDE_MS, number]>) {
      const storage = withGames(3);
      dismissBanner(storage, reason, NOW);
      expect(show(storage, "landing", NOW + duration - 1, { shownThisVisit: true })).toBe(false);
      expect(show(storage, "landing", NOW + duration)).toBe(true);
    }
    expect(HIDE_MS).toEqual({ close: 7 * 86_400_000, kofi: 30 * 86_400_000, donated: 90 * 86_400_000 });
  });

  it("never shows and never throws without storage", () => {
    expect(show(null)).toBe(false);
    expect(() => {
      recordFinishedGame(null);
      markBannerShown(null, NOW);
      dismissBanner(null, "close", NOW);
    }).not.toThrow();
    const broken: KeyValueStorage = {
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    expect(() => recordFinishedGame(broken)).not.toThrow();
    expect(show(broken)).toBe(false);
  });
});
