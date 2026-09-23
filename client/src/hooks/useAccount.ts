import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api";
import type { Account, PublicConfig } from "../api";
import { reconnectSocket } from "../socket";

export type AccountState = {
  status: "loading" | "guest" | "user";
  user: Account | null;
  config: PublicConfig | null;
};

export type AccountActions = {
  refresh: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setDisplayName: (displayName: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

export function useAccount(): AccountState & AccountActions {
  const [state, setState] = useState<AccountState>({ status: "loading", user: null, config: null });

  const signedIn = useCallback((user: Account) => {
    setState((current) => ({ ...current, status: "user", user }));
    reconnectSocket();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api<{ user: Account }>("/me");
      setState((current) => ({ ...current, status: "user", user }));
    } catch {
      setState((current) => ({ ...current, status: "guest", user: null }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    api<PublicConfig>("/config")
      .then((config) => setState((current) => ({ ...current, config })))
      .catch(() => undefined);
  }, [refresh]);

  const actions = useMemo<AccountActions>(
    () => ({
      refresh,
      register: async (email, password, displayName) => {
        await api("/auth/register", { body: { email, password, displayName } });
      },
      resendCode: async (email) => {
        await api("/auth/resend", { body: { email } });
      },
      verify: async (email, code) => signedIn((await api<{ user: Account }>("/auth/verify", { body: { email, code } })).user),
      login: async (email, password) => signedIn((await api<{ user: Account }>("/auth/login", { body: { email, password } })).user),
      forgotPassword: async (email) => {
        await api("/auth/password/forgot", { body: { email } });
      },
      resetPassword: async (email, code, password) =>
        signedIn((await api<{ user: Account }>("/auth/password/reset", { body: { email, code, password } })).user),
      logout: async () => {
        await api("/auth/logout", { body: {} });
        setState((current) => ({ ...current, status: "guest", user: null }));
        reconnectSocket();
      },
      setDisplayName: async (displayName) => {
        const { user } = await api<{ user: Account }>("/me", { method: "PATCH", body: { displayName } });
        setState((current) => ({ ...current, user }));
      },
      deleteAccount: async () => {
        await api("/me", { method: "DELETE" });
        setState((current) => ({ ...current, status: "guest", user: null }));
        reconnectSocket();
      },
    }),
    [refresh, signedIn],
  );

  return { ...state, ...actions };
}
