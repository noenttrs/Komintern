import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HIDE_MS, KOFI_URL, recordFinishedGame } from "../supportBanner";
import { SupportBanner, resetSupportBannerVisit } from "./SupportBanner";

const TEXT = "Jeu développé par une seule personne, sans pub. Si vous l'aimez, un café aide à continuer ☕";

function finishGames(count: number) {
  for (let index = 0; index < count; index += 1) recordFinishedGame(window.localStorage);
}

describe("SupportBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSupportBannerVisit();
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => vi.useRealTimers());

  it("stays hidden before 3 finished games and during a game", () => {
    finishGames(2);
    const { unmount } = render(<SupportBanner phase="landing" />);
    expect(screen.queryByText(TEXT)).toBeNull();
    unmount();
    finishGames(1);
    render(<SupportBanner phase="role_reveal" />);
    expect(screen.queryByText(TEXT)).toBeNull();
  });

  it("shows the exact text with an accessible Ko-fi link and close button", () => {
    finishGames(3);
    render(<SupportBanner phase="landing" />);
    expect(screen.getByText(TEXT)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Soutenir sur Ko-fi" });
    expect(link.getAttribute("href")).toBe(KOFI_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("button", { name: "Fermer le message de soutien" })).toBeTruthy();
  });

  it("stays visible from the landing to the waiting room in the same visit", () => {
    finishGames(3);
    const { unmount } = render(<SupportBanner phase="landing" />);
    unmount();
    render(<SupportBanner phase="waiting_room" />);
    expect(screen.getByText(TEXT)).toBeTruthy();
  });

  it.each([
    ["Fermer le message de soutien", "close"],
    ["J'ai déjà donné", "donated"],
    ["Soutenir sur Ko-fi", "kofi"],
  ] as const)("%s hides the banner for the matching duration", (name, reason) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    finishGames(3);
    const { unmount } = render(<SupportBanner phase="landing" />);
    const control = screen.queryByRole("button", { name }) ?? screen.getByRole("link", { name });
    act(() => {
      fireEvent.click(control);
    });
    expect(screen.queryByText(TEXT)).toBeNull();
    unmount();

    resetSupportBannerVisit();
    vi.setSystemTime(Date.now() + HIDE_MS[reason] - 1000);
    const again = render(<SupportBanner phase="landing" />);
    expect(screen.queryByText(TEXT)).toBeNull();
    again.unmount();

    resetSupportBannerVisit();
    vi.setSystemTime(Date.now() + 2000);
    render(<SupportBanner phase="landing" />);
    expect(screen.getByText(TEXT)).toBeTruthy();
  });

  it("renders nothing and does not crash when storage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<SupportBanner phase="landing" />);
    expect(screen.queryByText(TEXT)).toBeNull();
    spy.mockRestore();
  });
});
