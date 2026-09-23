import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Menu } from "./Menu";

const install = { canPrompt: false, isIos: false, installed: false, install: async () => undefined };

describe("Menu", () => {
  it("is closed by default, opens, navigates and closes with Escape", () => {
    render(<Menu signedIn={false} displayName={null} pendingRequests={0} install={install} />);
    const toggle = screen.getByRole("button", { name: "Ouvrir le menu" });
    expect(screen.getByRole("navigation", { hidden: true }).getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(toggle);
    expect(screen.getByRole("navigation").getAttribute("aria-hidden")).toBe("false");
    expect(screen.getByText("Se connecter")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("navigation", { hidden: true }).getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(toggle);
    fireEvent.click(screen.getByText("Mentions légales"));
    expect(window.location.pathname).toBe("/mentions-legales");
  });

  it("shows profile, friends and the pending request badge when signed in", () => {
    render(<Menu signedIn displayName="Rosa" pendingRequests={2} install={{ ...install, canPrompt: true }} />);
    expect(screen.getByText("2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));
    expect(screen.getByText("Rosa")).toBeTruthy();
    expect(screen.getByText("Amis (2)")).toBeTruthy();
    expect(screen.getByText("Installer l'application")).toBeTruthy();
  });
});
