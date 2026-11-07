import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  developmentSchedule,
  describeDevelopmentSchedule,
} from "@/lib/appointments/schedule";
export function AppointmentNotice({
  schedule = false,
}: {
  schedule?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-secondary/25 bg-secondary-tint px-4 py-3 text-xs leading-5">
      <p>
        Démonstration · Un dentiste, un agenda. Les changements restent dans la
        mémoire de cet onglet et sont réinitialisés au rechargement.
      </p>
      {schedule && (
        <p>
          {developmentSchedule.label} · {describeDevelopmentSchedule()} · Durées
          du prototype {developmentSchedule.minimumDuration}–
          {developmentSchedule.maximumDuration} min.
        </p>
      )}
    </div>
  );
}
export function AppointmentLoading() {
  return (
    <div
      role="status"
      className="rounded-xl border bg-surface p-8 text-sm text-muted-foreground"
    >
      Chargement des rendez-vous…
    </div>
  );
}
export function AppointmentError({ retry }: { retry: () => void }) {
  return (
    <Card className="p-6">
      <div role="alert">
        <h2 className="font-semibold">Impossible de charger les rendez-vous</h2>
        <p className="mt-2 mb-5 text-sm text-muted-foreground">
          Réessayez pour retrouver l’agenda de démonstration.
        </p>
      </div>
      <Button variant="outline" onClick={retry}>
        Réessayer
      </Button>
    </Card>
  );
}
export function AppointmentNotFound() {
  return (
    <Card className="p-8">
      <h1 className="text-xl font-bold">Rendez-vous introuvable</h1>
      <p className="mt-3 mb-6 text-sm leading-6 text-muted-foreground">
        Ce rendez-vous n’existe pas dans la mémoire de démonstration. Un
        rechargement réinitialise les créations fictives.
      </p>
      <Button asChild variant="outline">
        <Link href="/rendez-vous">Retour à l’agenda</Link>
      </Button>
    </Card>
  );
}
