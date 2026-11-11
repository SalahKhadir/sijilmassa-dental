import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
export function PrescriptionNotice() {
  return (
    <p className="rounded-lg border border-primary/20 bg-primary-tint p-4 text-sm leading-6 text-primary">
      Espace dentiste · Données fictives. Les changements sont effacés au
      rechargement.
    </p>
  );
}
export function PrescriptionLoading() {
  return (
    <p role="status" className="py-10 text-sm text-muted-foreground">
      Chargement des ordonnances…
    </p>
  );
}
export function PrescriptionErrorState({ retry }: { retry(): void }) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p role="alert">Impossible de charger les ordonnances.</p>
        <Button onClick={retry}>Réessayer</Button>
      </CardContent>
    </Card>
  );
}
export function PrescriptionMissing({
  message = "Cette ordonnance est introuvable.",
}: {
  message?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h1 className="text-xl font-semibold">{message}</h1>
        <Button asChild variant="outline">
          <Link href="/demo/documents">Retour aux documents</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
