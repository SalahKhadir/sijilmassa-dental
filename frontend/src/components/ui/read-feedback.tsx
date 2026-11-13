import type { ReactNode } from "react";

export function ReadError({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-l-4 border-l-danger bg-surface p-4 text-sm leading-6">
      <p role="alert">{children}</p>
      {action}
    </div>
  );
}

export function ListLoading({ children }: { children: string }) {
  return (
    <div className="space-y-4 rounded-xl border bg-surface p-4">
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{children}</p>
      <div aria-hidden="true" className="space-y-4 border-t pt-4">
        <div className="h-3 w-2/5 rounded-sm bg-border" />
        <div className="h-3 w-1/3 rounded-sm bg-border" />
        <div className="h-3 w-2/5 rounded-sm bg-border" />
      </div>
    </div>
  );
}
