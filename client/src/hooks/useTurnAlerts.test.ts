import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTurnAlerts } from "./useTurnAlerts";

describe("useTurnAlerts", () => {
  beforeEach(() => window.localStorage.clear());

  it("vibrates once per turn, and not when disabled", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const { rerender, result } = renderHook(({ key }) => useTurnAlerts(key), { initialProps: { key: null as string | null } });
    expect(vibrate).not.toHaveBeenCalled();
    rerender({ key: "vote-1-0" });
    rerender({ key: "vote-1-0" });
    expect(vibrate).toHaveBeenCalledTimes(1);
    result.current[1]({ vibration: false, sound: false });
    rerender({ key: "vote-1-1" });
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem("komintern.alerts") ?? "{}")).toEqual({ vibration: false, sound: false });
  });
});
