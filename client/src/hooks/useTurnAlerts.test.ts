import { act, renderHook } from "@testing-library/react";
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

  it("gives a preview when an alert is switched on in the menu", () => {
    window.localStorage.setItem("komintern.alerts", JSON.stringify({ vibration: false, sound: false }));
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const oscillators: number[] = [];
    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator() {
        const oscillator = { type: "", frequency: { value: 0 }, connect: (node: unknown) => node, start: () => oscillators.push(1), stop: () => undefined };
        return oscillator;
      }
      createGain() {
        return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (node: unknown) => node };
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const { result } = renderHook(() => useTurnAlerts(null));
    act(() => result.current[1]({ vibration: true, sound: false }));
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(0);
    act(() => result.current[1]({ vibration: true, sound: true }));
    expect(vibrate).toHaveBeenCalledTimes(1); // déjà activée : pas de nouvel aperçu
    expect(oscillators).toHaveLength(2);
    act(() => result.current[1]({ vibration: false, sound: false }));
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});
