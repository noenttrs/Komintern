import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatsGrid } from "./StatsGrid";

describe("StatsGrid", () => {
  it("explains empty stats", () => {
    render(<StatsGrid stats={{ wins: 0, losses: 0, gamesNazi: 0, gamesCommunist: 0 }} />);
    expect(screen.getByText("0 partie jouée")).toBeTruthy();
  });

  it("shows games played, wins, losses, win rate and the per-camp split", () => {
    render(<StatsGrid stats={{ wins: 3, losses: 1, gamesNazi: 1, gamesCommunist: 3, winsNazi: 0, winsCommunist: 3 }} />);
    expect(screen.getByText("Parties jouées").nextElementSibling?.textContent).toBe("4");
    expect(screen.getByText("Taux de victoire").nextElementSibling?.textContent).toBe("75 %");
    expect(screen.getByText(/3 parties · 3 victoires · 100 %/)).toBeTruthy();
    expect(screen.getByText(/1 partie · 0 victoire · 0 %/)).toBeTruthy();
  });
});
