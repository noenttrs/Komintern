import { describe, expect, it } from "vitest";

import { joinCodeFromPath, parseRoute } from "./router";

describe("joinCodeFromPath", () => {
  it("reads invitation links", () => {
    expect(joinCodeFromPath("/r/ab12cd")).toBe("AB12CD");
    expect(joinCodeFromPath("/r/AB12CD/")).toBe("AB12CD");
    expect(joinCodeFromPath("/r/!")).toBeNull();
    expect(joinCodeFromPath("/profil")).toBeNull();
  });
});

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
