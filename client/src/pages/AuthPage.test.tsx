import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../api";
import type { AccountActions, AccountState } from "../hooks/useAccount";
import { AuthPage } from "./AuthPage";

function account(overrides: Partial<AccountActions> = {}): AccountState & AccountActions {
  return {
    status: "guest",
    user: null,
    config: { googleEnabled: true, emailDelivery: true, legal: { editorName: "", contactEmail: "" }, donationUrl: "" },
    refresh: vi.fn(),
    register: vi.fn().mockResolvedValue(undefined),
    resendCode: vi.fn().mockResolvedValue(undefined),
    verify: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined),
    forgotPassword: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    setDisplayName: vi.fn(),
    deleteAccount: vi.fn(),
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("AuthPage", () => {
  it("registers then asks for the email code", async () => {
    const acc = account();
    render(<AuthPage account={acc} />);
    expect(screen.getByText("Continuer avec Google").getAttribute("href")).toBe("/api/auth/google");
    fireEvent.click(screen.getByText("Créer un compte"));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rosa@example.org" } });
    fireEvent.change(screen.getByLabelText(/Pseudo/), { target: { value: "Rosa" } });
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: "correct horse battery" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Créer mon compte"));
    });
    expect(acc.register).toHaveBeenCalledWith("rosa@example.org", "correct horse battery", "Rosa");
    expect(screen.getByLabelText("Code reçu par email")).toBeTruthy();
  });

  it("switches to code validation when the email is not verified", async () => {
    const acc = account({ login: vi.fn().mockRejectedValue(new ApiRequestError(403, "email_not_verified")) });
    render(<AuthPage account={acc} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rosa@example.org" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "whatever12345" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Se connecter"));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/pas encore validé/);
    expect(screen.getByLabelText("Code reçu par email")).toBeTruthy();
  });
});
