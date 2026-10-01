import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mesure d'audience côté navigateur : automates signalés, pages préchargées ou cachées comptées
// seulement une fois affichées.
type Module = typeof import("./audience");

const sent = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

function setDocument({ visibility = "visible", prerendering = false }: { visibility?: DocumentVisibilityState; prerendering?: boolean }) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  Object.defineProperty(document, "prerendering", { configurable: true, get: () => prerendering });
}

describe("recordPageView", () => {
  let audience: Module;
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))));
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => false });
    window.localStorage.clear();
    setDocument({});
    audience = await import("./audience");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("envoie une page vue par chemin, une seule fois de suite", () => {
    audience.recordPageView("/");
    audience.recordPageView("/");
    audience.recordPageView("/regles");
    expect(sent()).toEqual([{ path: "/" }, { path: "/regles" }]);
  });

  it("signale un navigateur piloté par un automate", () => {
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => true });
    audience.recordPageView("/");
    expect(sent()).toEqual([{ path: "/", automated: true }]);
  });

  it("attend qu'une page préchargée soit affichée, et n'envoie que la dernière", () => {
    setDocument({ prerendering: true, visibility: "hidden" });
    audience.recordPageView("/");
    audience.recordPageView("/regles");
    expect(sent()).toEqual([]);
    setDocument({});
    document.dispatchEvent(new Event("prerenderingchange"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sent()).toEqual([{ path: "/regles" }]);
  });

  it("n'envoie rien pour un onglet ouvert en arrière-plan et jamais regardé", () => {
    setDocument({ visibility: "hidden" });
    audience.recordPageView("/");
    expect(sent()).toEqual([]);
    setDocument({});
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sent()).toEqual([{ path: "/" }]);
  });

  it("respecte le refus de mesure", () => {
    audience.setAudienceOptOut(true);
    audience.recordPageView("/");
    expect(sent()).toEqual([]);
  });
});
