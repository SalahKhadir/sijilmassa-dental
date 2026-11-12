"use client";
import Link from "next/link";
import {
  CalendarDays,
  UsersRound,
  Wallet,
  Clock3,
  ArrowRight,
  Info,
} from "lucide-react";
import { useFinancialData } from "@/components/billing/use-billing-data";
import { financialSummary } from "@/lib/billing/calculations";
import { formatMinor } from "@/lib/billing/money";
import { DashboardFinances } from "@/components/billing/dashboard-finances";
import { BillingErrorState } from "@/components/billing/billing-states";
import { clinicDate } from "@/lib/patients/dates";
import { clinicTime } from "@/lib/appointments/local-time";
import { appointmentDashboardStats } from "@/lib/appointments/selectors";
import { useAppointmentData } from "@/components/appointments/use-appointment-data";
import {
  AppointmentError,
  AppointmentLoading,
} from "@/components/appointments/appointment-states";
import { formatDemoDate } from "@/lib/format";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { AppointmentList } from "@/components/dashboard/appointment-list";
import { QuickActions } from "@/components/dashboard/quick-actions";
export function DashboardOverview() {
  const { state, retry } = useAppointmentData();
  const financial = useFinancialData();
  const amounts =
    financial.state.status === "ready"
      ? financialSummary(
          financial.state.data.invoices,
          financial.state.data.payments,
        )
      : null;
  const today = clinicDate();
  const statistics =
    state.status === "ready"
      ? appointmentDashboardStats(state.data.appointments, today, clinicTime())
      : null;
  return (
    <>
      <PageHeading
        eyebrow="Votre cabinet, en un regard"
        title="Tableau de bord"
        description="Retrouvez les repères essentiels pour organiser votre journée."
      >
        <Button asChild>
          <Link href="/demo/rendez-vous">
            <CalendarDays aria-hidden="true" />
            Ouvrir l’agenda
          </Link>
        </Button>
      </PageHeading>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-xs">
        <p className="flex items-center gap-2 font-medium">
          <CalendarDays className="size-4 text-secondary" aria-hidden="true" />
          <span className="capitalize">{formatDemoDate(today)}</span>
        </p>
        <p className="text-muted-foreground">
          Agenda partagé · Données fictives
        </p>
      </div>
      <section
        aria-label="Indicateurs du cabinet"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          title="Patients"
          value={
            state.status === "ready" ? String(state.data.patients.length) : "…"
          }
          detail="Dossiers fictifs dans le cabinet"
          icon={UsersRound}
          primary
        />
        <StatCard
          title="Rendez-vous du jour"
          value={statistics ? String(statistics.todayCount) : "…"}
          detail="En attente, confirmés et terminés aujourd’hui"
          icon={CalendarDays}
        />
        <StatCard
          title="Montant encaissé"
          value={amounts ? formatMinor(amounts.collected) : "…"}
          detail="Règlements enregistrés dans le prototype"
          icon={Wallet}
        />
        <StatCard
          title="À confirmer"
          value={statistics ? String(statistics.pendingCount) : "…"}
          detail="En attente dans l’ensemble de l’agenda"
          icon={Clock3}
          primary
        />
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
        {state.status === "loading" ? (
          <AppointmentLoading />
        ) : state.status === "error" ? (
          <AppointmentError retry={retry} />
        ) : (
          <AppointmentList
            appointments={statistics?.upcoming.slice(0, 4) ?? []}
            patients={state.data.patients}
          />
        )}
        <div className="space-y-6">
          <QuickActions demo />
          {financial.state.status === "error" ? (
            <BillingErrorState retry={financial.retry} />
          ) : (
            <DashboardFinances summary={amounts} demo />
          )}
          <Card className="border-secondary/20 bg-secondary-tint">
            <CardContent className="pt-5 sm:pt-6">
              <Info className="mb-3 size-5 text-secondary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">
                Un espace en construction
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Cette première version pose les bases du cabinet. Les modules
                métier seront ajoutés progressivement.
              </p>
              <Link
                href="/parametres"
                className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary"
              >
                Voir les paramètres{" "}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
