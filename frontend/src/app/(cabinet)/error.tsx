"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section role="alert" className="rounded-xl border bg-surface p-8">
      <h1 className="text-xl font-bold">Impossible d’afficher cette page</h1>
      <p className="mt-3 mb-6 text-sm text-muted-foreground">
        Une erreur est survenue. Réessayez pour recharger votre espace.
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </section>
  );
}
