"use client";
import { useCallback, useEffect, useState } from "react";
import { createAppointmentApi, AppointmentApiError, type CalendarQuery, type PersistentAppointment } from "@/lib/appointments/api/client";
import { createPatientApi, PatientApiError } from "@/lib/patients/api/client";
import { patientSummary } from "@/lib/appointments/api/time";
import type { AppointmentPatient } from "@/lib/appointments/types";
import { requireLogin } from "@/lib/api/session-request";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

export function useAppointmentApi() { const [api] = useState(() => createAppointmentApi(fetch, requireLogin)); return api; }
export function AppointmentFailure({ error, retry }: { error: unknown; retry?: () => void }) {
  return <section className="space-y-3 rounded-xl border bg-surface p-5"><p role="alert">{error instanceof AppointmentApiError || error instanceof PatientApiError ? error.message : "Impossible de charger les rendez-vous."}</p>
    {retry && <Button variant="outline" onClick={retry}>Recharger les données</Button>}</section>;
}
export type CalendarData = { appointments: PersistentAppointment[]; patients: AppointmentPatient[] };
export function useRealCalendar(query: CalendarQuery) {
  const api = useAppointmentApi(); const { user } = useAuth();
  const [patients] = useState(() => createPatientApi(fetch, requireLogin));
  const key = `${user?.id}:${query.from}:${query.to}:${query.patientId ?? ""}`;
  const [state, setState] = useState<{ key: string; data?: CalendarData; error?: unknown; refreshing?: boolean }>();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const appointments = await api.list({ from: query.from, to: query.to, ...(query.patientId ? { patientId: query.patientId } : {}) });
        const ids = [...new Set(appointments.map(value => value.patientId))];
        const summaries: AppointmentPatient[] = [];
        // Bound concurrent identity lookups. The full administrative DTO is never retained in calendar state.
        for (let index = 0; index < ids.length; index += 6) {
          if (!active) return;
          summaries.push(...await Promise.all(ids.slice(index, index + 6).map(async id => patientSummary(await patients.get(id)))));
        }
        if (active) setState({ key, data: { appointments, patients: summaries } });
      } catch (error) { if (active) setState({ key, error }); }
    };
    void load(); return () => { active = false; };
  }, [api, patients, key, query.from, query.to, query.patientId, revision]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const interval = window.setInterval(visible, 30000);
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    window.addEventListener("sijilmassa-appointments-changed", visible);
    return () => { clearInterval(interval); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); window.removeEventListener("sijilmassa-appointments-changed", visible); };
  }, [refresh]);
  return { data: state?.key === key ? state.data : undefined, error: state?.key === key ? state.error : undefined, refresh };
}
export function appointmentChanged() { window.dispatchEvent(new Event("sijilmassa-appointments-changed")); }
export function isConflict(error: unknown) { return error instanceof AppointmentApiError && error.status === 409; }
