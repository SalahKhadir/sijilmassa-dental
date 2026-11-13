import Link from "next/link";
import { Button } from "@/components/ui/button";

export function NotFoundContent() {
  return (
    <section className="rounded-xl border bg-surface p-5 sm:p-8">
      <p className="mb-2 text-sm font-semibold text-primary">Erreur 404</p>
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="mt-3 mb-6 text-sm text-muted-foreground">
        Cette adresse ne correspond à aucun module du cabinet.
      </p>
      <Button asChild>
        <Link href="/">Retour au tableau de bord</Link>
      </Button>
    </section>
  );
}
