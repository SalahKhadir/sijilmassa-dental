import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
export function ClinicalNotice() {
  return (
    <p className="rounded-lg border border-primary/20 bg-primary-tint p-4 text-sm leading-6 text-primary">
      Espace dentiste · Données fictives conservées dans cet onglet jusqu’au
      rechargement. L’accès clinique devra être autorisé par le futur backend.
    </p>
  );
}
export function ClinicalLoading() {
  return (
    <p role="status" className="py-12 text-muted-foreground">
      Chargement de l’espace clinique…
    </p>
  );
}
export function ClinicalError({ retry }: { retry(): void }) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p role="alert">Impossible de charger les données cliniques.</p>
        <Button onClick={retry}>Réessayer</Button>
      </CardContent>
    </Card>
  );
}
export function ClinicalMissing({
  message = "Cette consultation est introuvable.",
}: {
  message?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h1 className="text-xl font-semibold">{message}</h1>
        <Button asChild variant="outline">
          <Link href="/demo/consultations">Retour aux consultations</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
