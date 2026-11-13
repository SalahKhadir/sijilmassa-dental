"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { ListLoading, ReadError } from "@/components/ui/read-feedback";
import { ClinicalApiError } from "@/lib/consultations/api/client";
import { PatientApiError } from "@/lib/patients/api/client";
import { AppointmentApiError } from "@/lib/appointments/api/client";

export function ClinicalBoundary({ children }: { children: ReactNode }) {
  const { state, checking } = useAuth();
  if (checking) return <p role="status">Vérification de la session clinique…</p>;
  if (state.status !== "authenticated") return <p role="alert">Session expirée ou non vérifiée. Reconnectez-vous avant d’ouvrir le dossier clinique.</p>;
  if (state.user.role !== "DENTIST") return <h1>Accès réservé au dentiste</h1>;
  return <div key={state.user.id}>{children}</div>;
}
export function ClinicalFailure({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof ClinicalApiError || error instanceof PatientApiError || error instanceof AppointmentApiError
    ? error.message : "Le dossier clinique ne peut pas être chargé.";
  return <ReadError action={retry && <Button type="button" variant="outline" onClick={retry}>Recharger les données</Button>}>{message}</ReadError>;
}
/** Owned by one authenticated screen, with stale-response rejection and no persistent cache. */
export function useClinicalLoad<T>(key: string, load: () => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: unknown }>();
  const currentKey = `${key}:${revision}`;
  useEffect(() => {
    let active = true;
    Promise.resolve().then(load).then(data => { if (active) setState({ key: currentKey, data }); }, error => { if (active) setState({ key: currentKey, error }); });
    return () => { active = false; };
  }, [currentKey, load]);
  return { data: state?.key === currentKey ? state.data : undefined, error: state?.key === currentKey ? state.error : undefined,
    reload: () => { setState(undefined); setRevision(value => value + 1); } };
}
export function ClinicalLoading() { return <ListLoading>Chargement du dossier clinique…</ListLoading>; }
