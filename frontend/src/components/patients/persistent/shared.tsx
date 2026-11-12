"use client";
import { useEffect, useState } from "react";
import { createPatientApi, PatientApiError } from "@/lib/patients/api/client";
import { requireLogin } from "@/lib/api/session-request";
import { Button } from "@/components/ui/button";

export function usePatientApi() {
  const [api] = useState(() => createPatientApi(fetch, requireLogin));
  return api;
}
export function PatientFailure({ error, retry }: { error: unknown; retry?: () => void }) {
  return <section className="space-y-3 rounded-xl border bg-surface p-5">
    <p role="alert">{error instanceof PatientApiError ? error.message : "Impossible de charger les données du patient."}</p>
    {retry && <Button variant="outline" onClick={retry}>Recharger les données</Button>}
  </section>;
}
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (document.documentElement.dataset.authBlocked !== "true") event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (target && !window.confirm("Quitter cette page et abandonner les modifications non enregistrées ?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    // Chromium's Navigation API can cancel a same-document history traversal before App Router changes the screen.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const traverse = (event: Event) => {
      if ("navigationType" in event && event.navigationType === "traverse" && event.cancelable
        && !window.confirm("Quitter cette page et abandonner les modifications non enregistrées ?")) event.preventDefault();
    };
    navigation?.addEventListener("navigate", traverse);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => { navigation?.removeEventListener("navigate", traverse); window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty]);
}
export function PersistentNotice() {
  return <p className="rounded-lg border border-secondary/30 bg-secondary-tint p-4 text-sm leading-6">
    Patients enregistrés dans la base du cabinet. Les dossiers enregistrés et les données de démonstration sont séparés.
  </p>;
}
