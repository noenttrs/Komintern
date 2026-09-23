import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GamesTab, UsersTab } from "./AdminModeration";

function mockFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      const key = Object.keys(routes).find((route) => url.startsWith(route));
      return new Response(key === undefined ? "" : JSON.stringify(routes[key]), { status: key === undefined ? 204 : 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("admin moderation tabs", () => {
  it("lists anonymous games in a table", async () => {
    mockFetch({
      "/api/admin/games": {
        games: [
          { id: "g1", endedAt: "2026-01-02T10:05:00Z", durationSeconds: 300, playerCount: 5, accounts: 2, mode: "missions", format: "5J", outcome: "finished", winner: "nazi", reason: "missions", duelWinners: null, missions: ["nazi", "communist"], chatMessages: 4, moderated: true },
        ],
      },
    });
    render(<GamesTab />);
    expect(await screen.findByText("5 (2 comptes)")).toBeTruthy();
    expect(screen.getByText("Nazis ⚑")).toBeTruthy();
    expect(screen.getByText("5 min")).toBeTruthy();
  });

  it("shows sanctioned accounts and sends a warning with its reason", async () => {
    const calls = mockFetch({
      "/api/admin/users": {
        users: [{ id: "u1", displayName: "Karl", email: "k@example.org", createdAt: "2026-01-01T00:00:00Z", bannedUntil: null, banReason: null, warnings: [{ id: "w1", at: "2026-01-02T00:00:00Z", reason: "Insultes", seen: false }], gamesPlayed: 3 }],
      },
    });
    vi.spyOn(window, "prompt").mockReturnValue("Récidive");
    render(<UsersTab />);
    expect(await screen.findByText("Karl")).toBeTruthy();
    expect(screen.getByText(/Insultes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Avertir" }));
    await waitFor(() => expect(calls.some((call) => call.url === "/api/admin/users/u1/warn" && (call.body as { reason: string }).reason === "Récidive")).toBe(true));
  });
});
