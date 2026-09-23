import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardSurface, isHoldGuardActive, resetHoldGuard } from "./CardSurface";

function renderCard(onConfirm: () => void) {
  return render(
    <CardSurface
      scoreLeft={<span>0</span>}
      scoreRight={<span>0</span>}
      front={<p>front</p>}
      overlay={<p>ROLE</p>}
      actions={
        <button type="button" onClick={onConfirm}>
          C'est bon
        </button>
      }
    />,
  );
}

describe("CardSurface long press", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetHoldGuard();
  });
  afterEach(() => vi.useRealTimers());

  it("shows the role while held and ignores a button tapped with another finger", () => {
    const onConfirm = vi.fn();
    const { container } = renderCard(onConfirm);
    const zone = container.querySelector(".card-zone") as HTMLElement;
    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 100 });
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByText("ROLE")).toBeTruthy();
    expect(isHoldGuardActive()).toBe(true);

    // Second doigt sur le bouton pendant l'appui long : il ne relance ni n'arrête l'appui.
    const button = screen.getByRole("button", { name: "C'est bon" });
    fireEvent.pointerDown(button, { pointerId: 2 });
    fireEvent.pointerUp(button, { pointerId: 2 });
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("ROLE")).toBeTruthy();

    // Relâché sur le bouton : le clic qui suit est ignoré aussi.
    fireEvent.pointerUp(zone, { pointerId: 1 });
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText("ROLE")).toBeNull();

    // Un instant plus tard, le bouton répond normalement.
    act(() => vi.advanceTimersByTime(500));
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a quick tap is a normal click", () => {
    const onConfirm = vi.fn();
    renderCard(onConfirm);
    const button = screen.getByRole("button", { name: "C'est bon" });
    fireEvent.pointerDown(button, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerUp(button, { pointerId: 1 });
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
