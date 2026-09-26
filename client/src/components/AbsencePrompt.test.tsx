import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomPlayer } from "../types";
import { AbsencePrompt } from "./AbsencePrompt";

const NOW = new Date("2026-01-01T12:00:00Z").getTime();

function players(absence: RoomPlayer["absence"]): RoomPlayer[] {
  return [
    { id: "me", pseudo: "Rosa" },
    { id: "p2", pseudo: "Karl", absence },
  ];
}

describe("AbsencePrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("offers to wait only in the last 20 seconds (with the notification)", () => {
    const onHold = vi.fn();
    render(<AbsencePrompt players={players({ since: NOW, kickAt: NOW + 60_000, heldBy: null })} myId="me" phase="mission_proposal" onHold={onHold} onRelease={vi.fn()} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    act(() => vi.advanceTimersByTime(39_000));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole("alertdialog").textContent).toContain("Karl s'est déconnecté");
    expect(screen.getByText(/son camp perd la partie/).textContent).toContain("19 s");
    fireEvent.click(screen.getByRole("button", { name: "Attendre Karl" }));
    expect(onHold).toHaveBeenCalledWith("p2");
  });

  it("can be dismissed locally, and says the game is cancelled before the roles", () => {
    render(<AbsencePrompt players={players({ since: NOW - 45_000, kickAt: NOW + 15_000, heldBy: null })} myId="me" phase="table_order" onHold={vi.fn()} onRelease={vi.fn()} />);
    expect(screen.getByText(/la partie est annulée/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ne pas attendre" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows who is waiting and lets anyone stop waiting", () => {
    const onRelease = vi.fn();
    render(<AbsencePrompt players={players({ since: NOW - 10_000, kickAt: NOW + 290_000, heldBy: "Rosa" })} myId="me" phase="confidence_vote" onHold={vi.fn()} onRelease={onRelease} />);
    expect(screen.getByRole("status").textContent).toContain("Rosa attend Karl · encore 4:50");
    fireEvent.click(screen.getByRole("button", { name: "Ne plus attendre" }));
    expect(onRelease).toHaveBeenCalledWith("p2");
  });

  it("stays hidden on the end screen and for players already counted absent", () => {
    const absence = { since: NOW - 10_000, kickAt: NOW + 50_000, heldBy: null };
    const { container, rerender } = render(<AbsencePrompt players={players(absence)} myId="me" phase="end_game" onHold={vi.fn()} onRelease={vi.fn()} />);
    expect(container.innerHTML).toBe("");
    rerender(<AbsencePrompt players={[{ id: "p2", pseudo: "Karl", isAfk: true, absence }]} myId="me" phase="mission_proposal" onHold={vi.fn()} onRelease={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
