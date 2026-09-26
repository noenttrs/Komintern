import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerAbsence, RoomPlayer } from "../types";
import { AbsencePrompt } from "./AbsencePrompt";

const NOW = new Date("2026-01-01T12:00:00Z").getTime();

function players(absence: PlayerAbsence | null, me: Partial<RoomPlayer> = {}): RoomPlayer[] {
  return [
    { id: "me", pseudo: "Rosa", ...me },
    { id: "p2", pseudo: "Karl", absence },
  ];
}

describe("AbsencePrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("shows a small vote after 30 s away, with the vote count", () => {
    const onVote = vi.fn();
    render(<AbsencePrompt players={players({ since: NOW, promptAt: NOW + 30_000, votes: [], needed: 2 })} myId="me" phase="mission_proposal" onVote={onVote} />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => vi.advanceTimersByTime(31_000));
    expect(screen.getByRole("status").textContent).toContain("Karl est absent depuis 0:31");
    expect(screen.getByText(/son camp perd la partie/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuer sans lui · 0/2" }));
    expect(onVote).toHaveBeenCalledWith("p2", true);
  });

  it("lets a player withdraw their vote, and says the game is cancelled before the roles", () => {
    const onVote = vi.fn();
    render(<AbsencePrompt players={players({ since: NOW - 40_000, promptAt: NOW - 10_000, votes: ["me"], needed: 2 })} myId="me" phase="table_order" onVote={onVote} />);
    expect(screen.getByText(/la partie est annulée/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Annuler mon vote · 1/2" }));
    expect(onVote).toHaveBeenCalledWith("p2", false);
  });

  it("stays hidden on the end screen, for players already counted absent, and for an absent viewer", () => {
    const absence = { since: NOW - 40_000, promptAt: NOW - 10_000, votes: [], needed: 1 };
    const { container, rerender } = render(<AbsencePrompt players={players(absence)} myId="me" phase="end_game" onVote={vi.fn()} />);
    expect(container.innerHTML).toBe("");
    rerender(<AbsencePrompt players={[{ id: "p2", pseudo: "Karl", isAfk: true, absence }]} myId="me" phase="mission_proposal" onVote={vi.fn()} />);
    expect(container.innerHTML).toBe("");
    rerender(<AbsencePrompt players={players(absence, { absence })} myId="me" phase="mission_proposal" onVote={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
