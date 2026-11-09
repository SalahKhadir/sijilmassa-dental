import Link from "next/link";
import { ArrowLeft, UsersRound, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function PatientDemoNotice() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-secondary/25 bg-secondary-tint px-4 py-3 text-xs leading-5 text-foreground">
      <Info
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-secondary"
      />
      <span>
        Démonstration · Données fictives uniquement. Les créations et
        modifications restent en mémoire et sont réinitialisées au rechargement.
      </span>
    </p>
  );
}
export function PatientLoading() {
  return (
    <div
      role="status"
      className="rounded-xl border bg-surface p-8 text-sm text-muted-foreground"
    >
      Chargement des dossiers patients…
    </div>
  );
}
export function PatientError({ retry }: { retry: () => void }) {
  return (
    <Card className="p-6">
      <div role="alert">
        <h2 className="font-semibold">Impossible de charger les patients</h2>
        <p className="mt-2 mb-5 text-sm text-muted-foreground">
          Une erreur est survenue. Réessayez pour retrouver les dossiers de
          démonstration.
        </p>
      </div>
      <Button onClick={retry} variant="outline">
        Réessayer
      </Button>
    </Card>
  );
}
export function PatientNotFound() {
  return (
    <Card className="p-8 text-center">
      <UsersRound
        aria-hidden="true"
        className="mx-auto mb-4 size-8 text-secondary"
      />
      <h1 className="text-xl font-bold">Patient introuvable</h1>
      <p className="mt-3 mb-6 text-sm leading-6 text-muted-foreground">
        Ce dossier n’existe pas dans la mémoire de démonstration. Les créations
        fictives sont réinitialisées au rechargement.
      </p>
      <Button asChild variant="outline">
        <Link href="/demo/patients">
          <ArrowLeft aria-hidden="true" />
          Retour à l’annuaire
        </Link>
      </Button>
    </Card>
  );
}
