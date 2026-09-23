import { describe, expect, it } from "vitest";

import { roomCodeFromQr } from "./QrScanner";

describe("roomCodeFromQr", () => {
  it("only accepts a room link of this site", () => {
    const origin = "https://fascismwontget.me";
    expect(roomCodeFromQr("https://fascismwontget.me/r/ab3k9x2q", origin)).toBe("AB3K9X2Q");
    expect(roomCodeFromQr("  https://fascismwontget.me/r/ROOM/ ", origin)).toBe("ROOM");
    expect(roomCodeFromQr("https://evil.example/r/ROOM", origin)).toBeNull();
    expect(roomCodeFromQr("https://fascismwontget.me/profil", origin)).toBeNull();
    expect(roomCodeFromQr("ROOM", origin)).toBeNull();
  });
});
