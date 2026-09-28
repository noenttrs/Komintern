import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordFinishedGame } from "../supportBanner";
import { InstallBanner } from "./InstallBanner";
import { resetSupportBannerVisit } from "./SupportBanner";

const prompt = (overrides: Partial<Parameters<typeof InstallBanner>[0]["install"]> = {}) => ({
  canPrompt: true,
  isIos: false,
  installed: false,
  install: vi.fn(async () => undefined),
  ...overrides,
});

describe("InstallBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSupportBannerVisit();
  });

  it("waits for a first finished game, and never shows once installed or without an install option", () => {
    const { rerender } = render(<InstallBanner install={prompt()} />);
    expect(screen.queryByRole("complementary")).toBeNull();
    recordFinishedGame(window.localStorage);
    rerender(<InstallBanner install={prompt({ installed: true })} />);
    expect(screen.queryByRole("complementary")).toBeNull();
    rerender(<InstallBanner install={prompt({ canPrompt: false })} />);
    expect(screen.queryByRole("complementary")).toBeNull();
    const install = prompt();
    rerender(<InstallBanner install={install} />);
    fireEvent.click(screen.getByRole("button", { name: "Installer" }));
    expect(install.install).toHaveBeenCalled();
  });

  it("« Plus tard » hides it for 30 days", () => {
    recordFinishedGame(window.localStorage);
    const { unmount } = render(<InstallBanner install={prompt()} />);
    fireEvent.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    unmount();
    render(<InstallBanner install={prompt()} />);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(Number(window.localStorage.getItem("komintern.install_banner"))).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
  });
});
