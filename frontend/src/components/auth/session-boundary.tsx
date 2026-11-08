"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { canAccessPath, dashboardFor, hasPermission, type Permission } from "@/lib/auth/permissions";
import { useAuth, useOptionalAuth } from "./auth-provider";

export function SessionUnavailable() {
  return <main id="contenu" className="mx-auto max-w-xl space-y-4 p-8">
    <h1 className="text-xl font-semibold">Session non vérifiée</h1>
    <p role="alert">Le serveur ne permet pas de vérifier votre session. Votre déconnexion n’est pas confirmée.</p>
    <Button onClick={() => window.location.reload()}>Réessayer</Button>
  </main>;
}
export function SessionBoundary({ children, login = false }: { children: ReactNode; login?: boolean }) {
  const { state, user, checking, checkedPath, refresh } = useAuth();
  const pathname = usePathname();
  const pending = checking || checkedPath !== pathname;
  const target = !pending && state.status === "unauthenticated" && !login ? "/login"
    : !pending && state.status === "authenticated" && login ? dashboardFor(state.user.role) : null;
  useEffect(() => { if (target) window.location.replace(target); }, [target]);
  const error = state.status === "error";
  const allowed = user ? canAccessPath(user.role, pathname) : login;
  const hidden = Boolean(target) || error || (!login && pending);
  return <>
    {pending || target ? <p role="status" className="p-8">Vérification de la session…</p> : null}
    {error ? <section className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Session non vérifiée</h1><p role="alert">{state.message}</p>
      <Button onClick={() => void refresh()}>Réessayer</Button>
    </section> : null}
    {!pending && !error && !target && user && !allowed ? <main id="contenu" className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Accès réservé au dentiste</h1>
      <p>Cette vue contient des informations cliniques ou des fonctions dont l’accès administratif reste à définir.</p>
      <a className="text-primary underline" href={dashboardFor(user.role)}>Retour à l’agenda</a>
    </main> : null}
    {/* Preserve mounted prototype providers/forms during revalidation; keep them invisible and inert. */}
    {allowed ? <div hidden={hidden} inert={hidden} data-authenticated-content={login ? undefined : "true"}>{children}</div> : null}
  </>;

}
export function PermissionGate({ permission, children }: { permission: Permission; children: ReactNode }) {
  const auth = useOptionalAuth();
  return auth?.state.status === "authenticated" && hasPermission(auth.state.user.role, permission) ? children : null;
}
