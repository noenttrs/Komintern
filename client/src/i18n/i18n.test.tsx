import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Menu } from "../components/Menu";
import { en } from "./en";
import { fr } from "./fr";
import { detectLanguage, getLang, LanguageProvider, translate, translatePlural, translateRich } from "./index";

/** Chemins de toutes les feuilles d'un dictionnaire, triés. */
function leafKeys(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node as Record<string, unknown>)
    .flatMap(([key, value]) => leafKeys(value, prefix === "" ? key : `${prefix}.${key}`))
    .sort();
}

const install = { canPrompt: false, isIos: false, installed: false, install: async () => undefined };

describe("i18n", () => {
  it("has exactly the same keys in French and English, all non-empty in English", () => {
    const frKeys = leafKeys(fr);
    expect(leafKeys(en)).toEqual(frKeys);
    expect(frKeys.length).toBeGreaterThan(300);
    for (const key of frKeys) {
      expect(translate(key as never, undefined, "en"), key).not.toBe("");
    }
  });

  it("interpolates variables, plurals and rich text", () => {
    expect(translate("waiting.start", { count: 5 })).toBe("Demarrer (5 joueurs)");
    expect(translate("waiting.start", { count: 5 }, "en")).toBe("Start (5 players)");
    expect(translate("status.invite", { name: "Rosa", code: "ROOM" }, "en")).toBe("Rosa invites you to room ROOM");
    // Variable absente : le marqueur reste visible plutôt que de disparaître.
    expect(translate("pseudo.inviteHint")).toBe("Choisis un pseudo pour rejoindre la room {code}.");
    expect(translatePlural("stats.victories", 0)).toBe("0 victoire");
    expect(translatePlural("stats.victories", 0, undefined, "en")).toBe("0 wins");
    expect(translatePlural("stats.games", 1, undefined, "en")).toBe("1 game");

    render(<p data-testid="rich">{translateRich("legal.controller", { mail: <a href="mailto:x@y.z">x@y.z</a> })}</p>);
    const rich = screen.getByTestId("rich");
    expect(rich.textContent).toBe(
      "Le responsable du traitement est l'éditeur ci-dessus, joignable à x@y.z. Aucune donnée n'est vendue ni utilisée à des fins publicitaires.",
    );
    expect(rich.querySelector("a")?.getAttribute("href")).toBe("mailto:x@y.z");
  });

  it("defaults to French unless the browser declares no French at all", () => {
    const languages = vi.spyOn(navigator, "languages", "get");
    try {
      window.localStorage.removeItem("komintern.lang");
      languages.mockReturnValue(["en-US", "en"]);
      expect(detectLanguage()).toBe("en");
      languages.mockReturnValue(["en-US", "fr-CA"]);
      expect(detectLanguage()).toBe("fr");
      languages.mockReturnValue([]);
      expect(detectLanguage()).toBe(navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en");
      window.localStorage.setItem("komintern.lang", "fr");
      languages.mockReturnValue(["en-US"]);
      expect(detectLanguage()).toBe("fr");
    } finally {
      languages.mockRestore();
    }
  });

  it("switches the menu to English and back, and updates <html lang>", () => {
    render(
      <LanguageProvider>
        <Menu signedIn={false} displayName={null} pendingRequests={0} install={install} />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));
    expect(screen.getByText("Se connecter")).toBeTruthy();
    const frButton = screen.getByRole("button", { name: "FR" });
    expect(frButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(getLang()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("komintern.lang")).toBe("en");
    expect(screen.getByText("Log in")).toBeTruthy();
    expect(screen.getByText("Legal notice")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close menu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "EN" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "FR" }));
    expect(screen.getByText("Se connecter")).toBeTruthy();
    expect(document.documentElement.lang).toBe("fr");
  });
});
