"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { requireLogin } from "@/lib/api/session-request";
import { savePdfDownload } from "@/lib/api/pdf-download";
import { DossierDownloadError, fetchPatientDossier } from "@/lib/patients/api/dossier";

export function DossierDownload({ patientId }: { patientId: string }) {
  const { state, checking } = useAuth();
  const owner = state.status === "authenticated" && state.user.role === "DENTIST" && !checking ? state.user.id : undefined;
  const active = useRef<AbortController>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useLayoutEffect(() => () => { active.current?.abort(); }, [owner, patientId]);

  async function download() {
    if (!owner || active.current || document.documentElement.dataset.authBlocked === "true") return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError("");
    try {
      const file = await fetchPatientDossier(patientId, controller.signal, () => {
        if (!controller.signal.aborted) requireLogin();
      });
      if (!controller.signal.aborted && document.documentElement.dataset.authBlocked !== "true") savePdfDownload(file);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof DossierDownloadError ? failure.message : "Le dossier PDF n’a pas pu être téléchargé.");
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }
  if (!owner) return null;
  return <div className="space-y-2">
    <Button type="button" variant="outline" disabled={pending} onClick={() => void download()}>
      {pending ? "Préparation du dossier PDF…" : "Télécharger le dossier PDF"}
    </Button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
