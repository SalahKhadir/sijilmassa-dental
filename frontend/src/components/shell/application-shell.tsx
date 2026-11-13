import { DataScopeLabel } from "./data-scope-label";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { Navigation } from "./navigation";
import { TopBar } from "./top-bar";

export function ApplicationShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside
        aria-label="Menu du cabinet"
        className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r bg-surface px-5 py-6 lg:flex"
      >
        <Brand />
        <div className="mt-8 pb-6"><Navigation /></div>
        <p className="mt-auto border-t pt-4 text-xs leading-5 text-muted-foreground">
          <DataScopeLabel compact />
        </p>
      </aside>
      <div className="min-w-0">
        <TopBar brand={<Brand />} />
        <main
          id="contenu"
          tabIndex={-1}
          className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 focus-visible:-outline-offset-2 sm:space-y-6 sm:px-8 sm:py-7 xl:px-10"
        >
          {children}
        </main>
        <footer className="px-4 pb-6 text-xs text-muted-foreground sm:px-8 xl:px-10">
          <DataScopeLabel />
        </footer>
      </div>
    </div>
  );
}
