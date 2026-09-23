import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModerationPage } from "./ModerationPage";

const caseEntry = {
  id: "case_1",
  createdAt: "2026-01-02T10:00:00Z",
  status: "open",
  trigger: { type: "flagged_word", words: ["je sais ou tu habites"], categories: ["menaces"] },
  messages: [{ pseudonym: "Joueur A", text: "je sais où tu habites", at: "2026-01-02T10:00:00Z", flagged: true }],
  resolution: null,
};

function mockApi() {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      const json =
        url === "/api/moderation/session"
          ? { elevated: true, role: "moderator", totpEnabled: true }
          : url.startsWith("/api/moderation/cases?")
            ? { cases: [caseEntry] }
            : url === "/api/moderation/cases/case_1"
              ? {
                  case: caseEntry,
                  participants: [
                    { pseudonym: "Joueur A", kind: "account", priorSanctions: 1, restriction: null },
                    { pseudonym: "Joueur B", kind: "guest", priorSanctions: 0, restriction: null },
                  ],
                  banRequests: [],
                  audit: [],
                }
              : { applied: "mute" };
      return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("ModerationPage", () => {
  it("shows anonymous cases and applies a sanction by pseudonym only", async () => {
    const calls = mockApi();
    vi.spyOn(window, "prompt").mockReturnValue("Menaces");
    render(<ModerationPage isStaff />);
    fireEvent.click(await screen.findByText(/menaces · je sais ou tu habites/));
    expect(await screen.findByText("1 sanction(s) déjà reçue(s)")).toBeTruthy();
    expect(screen.getByText("Joueur sans compte : aucune sanction durable possible.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mute 24 h" }));
    await waitFor(() =>
      expect(calls.find((call) => call.url === "/api/moderation/cases/case_1/sanction")?.body).toEqual({ pseudonym: "Joueur A", type: "mute", duration: 24, reason: "Menaces" }),
    );
  });

  it("does not exist for regular players", () => {
    render(<ModerationPage isStaff={false} />);
    expect(screen.getByText("Cette page n'existe pas.")).toBeTruthy();
  });
});
