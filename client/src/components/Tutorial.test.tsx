import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { Tutorial } from "./Tutorial";

describe("Tutorial", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows each tip once, then remembers it", () => {
    const { rerender, unmount } = render(<Tutorial phase="table_order" />);
    expect(screen.getByRole("dialog", { name: "Ordre de table" })).toBeTruthy();
    fireEvent.click(screen.getByText("Compris"));
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Tutorial phase="confidence_vote" />);
    expect(screen.getByRole("dialog", { name: "Vote de confiance" })).toBeTruthy();
    unmount();
    render(<Tutorial phase="table_order" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("can be turned off entirely, and ignores screens without tips", () => {
    const { rerender } = render(<Tutorial phase="waiting_room" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Tutorial phase="role_reveal" />);
    fireEvent.click(screen.getByText("Ne plus afficher d'astuces"));
    rerender(<Tutorial phase="mission_execution" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
