"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, UsersRound, Clock3 } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "./stat-card";
import { DashboardFinances } from "@/components/billing/dashboard-finances";
import { useFinancialData } from "@/components/billing/use-billing-data";
import { financialSummary } from "@/lib/billing/calculations";
import { BillingErrorState } from "@/components/billing/billing-states";
import { clinicDate } from "@/lib/patients/dates";
import { calendarWindow } from "@/lib/appointments/api/time";
import { createPatientApi } from "@/lib/patients/api/client";
import { requireLogin } from "@/lib/api/session-request";
import { AppointmentFailure, useRealCalendar } from "@/components/appointments/persistent/shared";
import { RealAgenda } from "@/components/appointments/persistent/agenda";

export function PersistentDashboardOverview() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const today = clinicDate(new Date(now));
  const { data, error, refresh } = useRealCalendar(calendarWindow(today, "day"));
  const [api] = useState(() => createPatientApi(fetch, requireLogin));
  const [patients, setPatients] = useState<number>(); const [patientError, setPatientError] = useState<unknown>();
  useEffect(() => {
    let active = true;
    const load = () => api.list({ q: "", status: "active", sort: "name", page: 1, pageSize: 1 }).then(value => { if (active) { setPatients(value.total); setPatientError(undefined); } }, error => { if (active) setPatientError(error); });
    void load(); window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, [api]);
  const financial = useFinancialData();
  const amounts = financial.state.status === "ready" ? financialSummary(financial.state.data.invoices, financial.state.data.payments) : null;
  const upcoming = data ? { ...data, appointments: data.appointments.filter(value => ["EN_ATTENTE", "CONFIRME"].includes(value.status) && Date.parse(value.endAt) > now) } : undefined;
  return <>
    <PageHeading eyebrow="Votre cabinet, en un regard" title="Tableau de bord" description="Patients et rendez-vous enregistrés du cabinet."><Button asChild><Link href="/rendez-vous"><CalendarDays aria-hidden="true" />Ouvrir l’agenda</Link></Button></PageHeading>
    <p className="text-sm text-muted-foreground">Agenda réel du {today} · Africa/Casablanca · Les compteurs de rendez-vous concernent uniquement cette journée.</p>
    <section aria-label="Indicateurs réels du cabinet" className="grid gap-4 sm:grid-cols-3"><StatCard title="Patients actifs" value={!patientError && patients !== undefined ? String(patients) : "…"} detail="Total de l’annuaire enregistré" icon={UsersRound} primary />
      <StatCard title="Rendez-vous du jour" value={data ? String(data.appointments.filter(value => ["EN_ATTENTE", "CONFIRME", "TERMINE"].includes(value.status)).length) : "…"} detail="En attente, confirmés et terminés aujourd’hui" icon={CalendarDays} />
      <StatCard title="À confirmer aujourd’hui" value={data ? String(data.appointments.filter(value => value.status === "EN_ATTENTE").length) : "…"} detail="En attente dans la journée affichée" icon={Clock3} /></section>
    {patientError ? <AppointmentFailure error={patientError} /> : null}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]"><Card className="overflow-hidden"><CardHeader className="border-b"><CardTitle>Prochains rendez-vous aujourd’hui</CardTitle></CardHeader>
      {error ? <AppointmentFailure error={error} retry={refresh} /> : !upcoming ? <p role="status" className="p-5">Chargement des rendez-vous…</p> : <RealAgenda data={upcoming} limit={4} />}</Card>
      <section className="space-y-4 rounded-xl border p-4" aria-label="Finances de démonstration"><h2 className="font-semibold">Finances — Démonstration</h2><p className="text-xs text-muted-foreground">Factures et paiements fictifs en mémoire, sans lien avec les patients ou rendez-vous enregistrés.</p>
        {financial.state.status === "error" ? <BillingErrorState retry={financial.retry} /> : <DashboardFinances summary={amounts} />}</section></div>
  </>;
}
