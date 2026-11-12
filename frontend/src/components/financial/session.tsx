"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { requireLogin } from "@/lib/api/session-request";
import { createFinancialApi } from "@/lib/financial/client";
import type { Role } from "@/lib/auth/types";
import { createPaymentAttempts } from "@/lib/financial/payment-attempt";

const Attempts = createContext<ReturnType<typeof createPaymentAttempts> | null>(null);

function SessionAttempts({ children }: { children: ReactNode }) {
  const [store] = useState(createPaymentAttempts);
  const attempt = useSyncExternalStore(store.subscribe, store.snapshot, emptyAttempt);
  useEffect(() => {
    if (!attempt) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (document.documentElement.dataset.authBlocked !== "true") event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); };
  }, [attempt]);
  return <Attempts.Provider value={store}>{children}</Attempts.Provider>;
}

export function FinancialSession({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <SessionAttempts key={user ? `${user.id}:${user.role}` : "anonymous"}>{children}</SessionAttempts>;
}

const emptyAttempt = () => undefined;
export function usePaymentAttempts() {
  const store = useContext(Attempts);
  if (!store) throw new Error("FinancialSession obligatoire");
  return { store, attempt: useSyncExternalStore(store.subscribe, store.snapshot, emptyAttempt) };
}

type SessionApiOptions = {
  access: () => Role | undefined;
  signal: () => AbortSignal | undefined;
  unauthenticated: () => void;
};

function createSessionScope<T>(factory: (options: SessionApiOptions) => T, role?: Role) {
  let controller: AbortController | undefined;
  const api = factory({
    access: () => controller?.signal.aborted === false && document.documentElement.dataset.authBlocked !== "true" ? role : undefined,
    signal: () => controller?.signal,
    unauthenticated: () => { if (controller?.signal.aborted === false) requireLogin(); },
  });
  return {
    api,
    start() {
      const active = new AbortController();
      controller = active;
      return () => { active.abort(); };
    },
  };
}

export function useSessionBillingApi<T>(factory: (options: SessionApiOptions) => T) {
  const { state, checking } = useAuth();
  const owner = state.status === "authenticated" && !checking ? state.user.id : undefined;
  const role = state.status === "authenticated" && !checking ? state.user.role : undefined;
  const scope = useMemo(() => createSessionScope(factory, owner ? role : undefined), [factory, owner, role]);
  useLayoutEffect(() => scope.start(), [scope]);
  return { api: scope.api, role, owner };
}

export function useFinancialApi() {
  return useSessionBillingApi(createFinancialApi);
}
