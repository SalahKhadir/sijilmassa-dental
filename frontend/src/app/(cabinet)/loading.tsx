export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-7">
      <p className="text-sm text-muted-foreground">
        Chargement de votre espace…
      </p>
      <div aria-hidden="true" className="h-10 w-2/3 rounded-lg bg-border/60" />
      <div
        aria-hidden="true"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[1, 2, 3, 4].map((id) => (
          <div key={id} className="h-40 rounded-xl border bg-surface" />
        ))}
      </div>
    </div>
  );
}
