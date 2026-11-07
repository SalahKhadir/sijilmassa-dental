import type { ReactNode } from "react";
import { Brand } from "./brand";
import { Navigation } from "./navigation";
import { TopBar } from "./top-bar";

export function ApplicationShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside
        aria-label="Menu du cabinet"
        className="sticky top-0 hidden h-dvh flex-col border-r bg-surface px-5 py-7 lg:flex"
      >
        <Brand />
        <p className="mt-10 mb-4 px-3 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          Votre espace
        </p>
        <Navigation />
        <div className="mt-auto border-t pt-5">
          <p className="flex items-center gap-2 text-xs font-medium">
            <span className="size-1.5 rounded-full bg-accent" />
            Pensé pour votre cabinet
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Prototype frontend · Phase 7
          </p>
        </div>
      </aside>
      <div className="min-w-0">
        <TopBar brand={<Brand />} />
        <main
          id="contenu"
          tabIndex={-1}
          className="mx-auto max-w-[1600px] space-y-7 px-4 py-7 outline-none sm:px-8 sm:py-8 xl:px-10"
        >
          {children}
        </main>
        <footer className="px-4 pb-6 text-xs text-muted-foreground sm:px-8 xl:px-10">
          Sijilmassa Dental · Données fictives · Modifications temporaires en
          mémoire
        </footer>
      </div>
    </div>
  );
}
