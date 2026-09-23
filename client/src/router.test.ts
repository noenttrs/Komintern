import { describe, expect, it } from "vitest";

import { parseRoute } from "./router";

describe("parseRoute", () => {
  it("maps paths to pages", () => {
    expect(parseRoute("/")).toEqual({ page: "game" });
    expect(parseRoute("/connexion")).toEqual({ page: "auth" });
    expect(parseRoute("/amis/")).toEqual({ page: "friends" });
    expect(parseRoute("/profil", "?setup=1")).toEqual({ page: "profile", userId: null, setup: true });
    expect(parseRoute("/profil/u_abc123")).toEqual({ page: "profile", userId: "u_abc123", setup: false });
    expect(parseRoute("/mentions-legales")).toEqual({ page: "legal" });
    expect(parseRoute("/nimporte/quoi")).toEqual({ page: "game" });
  });
});
