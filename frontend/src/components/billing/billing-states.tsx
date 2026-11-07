import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
export function BillingNotice() {
  return (
    <p className="rounded-lg border border-primary/20 bg-primary-tint p-4 text-sm leading-6 text-primary">
      Données fictives · Les changements sont effacés au rechargement. Les prix
      sont fixés par le dentiste dans ce prototype.
    </p>
  );
}
export function BillingLoading() {
  return (
    <p role="status" className="py-8 text-sm text-muted-foreground">
      Chargement de la facturation…
    </p>
  );
}
export function BillingErrorState({ retry }: { retry(): void }) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p role="alert">Impossible de charger la facturation.</p>
        <Button onClick={retry}>Réessayer</Button>
      </CardContent>
    </Card>
  );
}
export function InvoiceMissing({
  message = "Cette facture est introuvable.",
}: {
  message?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h1 className="text-xl font-semibold">{message}</h1>
        <Button asChild variant="outline">
          <Link href="/facturation">Retour à la facturation</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
