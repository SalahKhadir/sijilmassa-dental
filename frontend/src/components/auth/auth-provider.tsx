"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { requireLogin } from "@/lib/api/session-request";
import { createAuthenticationService } from "@/lib/auth/authentication-service";
import type { LoginCredentials } from "@/lib/auth/login-schema";
import type { Identity, SessionResult } from "@/lib/auth/types";

type AuthContextValue = {
  state: SessionResult; user: Identity | null; checking: boolean; checkedPath: string;
  refresh(): Promise<void>;
  signIn(credentials: LoginCredentials): Promise<SessionResult>;
  signOut(): Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ initial, children }: { initial: SessionResult; children: ReactNode }) {
  const pathname = usePathname();
  const [api] = useState(createAuthenticationService);
  const [state, setState] = useState<SessionResult>(initial);
  const [user, setUser] = useState<Identity | null>(initial.status === "authenticated" ? initial.user : null);
  const [checking, setChecking] = useState(false);
  const [checkedPath, setCheckedPath] = useState(pathname);
  const sequence = useRef(0);
  const busy = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);

  const apply = useCallback((result: SessionResult) => {
    if (result.status === "authenticated") delete document.documentElement.dataset.authBlocked;
    else document.documentElement.dataset.authBlocked = "true";
    setState(result);
    if (result.status === "authenticated") setUser(result.user);
    if (result.status === "unauthenticated") setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    const ticket = ++sequence.current;
    const result = await api.restore();
    if (ticket !== sequence.current) return;
    apply(result);
    setCheckedPath(pathname);
    setChecking(false);
    if (result.status === "authenticated") delete document.documentElement.dataset.authSuspended;
  }, [api, apply, pathname]);

  const invalidatePending = useCallback(() => { ++sequence.current; }, []);

  useEffect(() => {
    // Revalidate on navigation, focus, back/forward restoration and every 30s while visible.
    void refresh();
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    const hide = () => { document.documentElement.dataset.authSuspended = "true"; };
    const show = () => { hide(); setChecking(true); void refresh(); };
    window.addEventListener("focus", visible);
    window.addEventListener("pageshow", show);
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visible);
    const interval = window.setInterval(visible, 30000);
    return () => {
      invalidatePending();
      window.clearInterval(interval);
      window.removeEventListener("focus", visible);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, invalidatePending]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const current = new BroadcastChannel("sijilmassa-session");
    channel.current = current;
    current.onmessage = () => { setChecking(true); void refresh(); };
    return () => { current.close(); channel.current = null; };
  }, [refresh]);

  const signIn = async (credentials: LoginCredentials): Promise<SessionResult> => {
    if (busy.current) return { status: "error", code: 409, message: "Une connexion est déjà en cours." };
    busy.current = true;
    ++sequence.current;
    try {
      const result = await api.signIn(credentials);
      if (result.status === "authenticated") {
        apply(result);
        channel.current?.postMessage("session-changed");
      }
      return result;
    } finally { busy.current = false; setChecking(false); }
  };

  const signOut = async () => {
    if (busy.current) return;
    busy.current = true;
    ++sequence.current;
    document.documentElement.dataset.authBlocked = "true";
    setChecking(true);
    try {
      const result = await api.signOut();
      if (result.status === "ok") {
        apply({ status: "unauthenticated" });
        channel.current?.postMessage("session-changed");
        // Full navigation discards the App Router cache and all prototype providers.
        requireLogin();
      } else {
        setState({ ...result, message: "Déconnexion non confirmée. Vérifiez la connexion au serveur avant de réessayer." });
      }
    } finally { busy.current = false; setChecking(false); }
  };

  return <AuthContext.Provider value={{ state, user, checking, checkedPath, refresh, signIn, signOut }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider obligatoire");
  return context;
}
export function useOptionalAuth() { return useContext(AuthContext); }
