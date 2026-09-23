import { describe, expect, it } from "vitest";

import { achievements } from "./achievements";

describe("achievements", () => {
  it("unlocks from stats and shows progress", () => {
    const list = achievements({ wins: 6, losses: 2, gamesNazi: 3, gamesCommunist: 5, winsNazi: 1, winsCommunist: 5 });
    const byId = Object.fromEntries(list.map((entry) => [entry.id, entry]));
    expect(byId["first-win"]?.unlocked).toBe(true);
    expect(byId["both-sides"]?.unlocked).toBe(true);
    expect(byId["resistant"]?.unlocked).toBe(true);
    expect(byId["saboteur"]).toMatchObject({ unlocked: false, progress: "1/5" });
    expect(byId["strategist"]).toMatchObject({ unlocked: false, progress: "8/20 parties" });
  });
});
