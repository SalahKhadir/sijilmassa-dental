"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { navigation } from "@/lib/navigation";
import { MobileNavigation } from "./mobile-navigation";
export function TopBar({ brand }: { brand: ReactNode }) {
  const path = usePathname();
  const title =
    navigation.find(
      (item) =>
        item.href === path ||
        (item.href !== "/" && path.startsWith(`${item.href}/`)),
    )?.label ?? "Page introuvable";
  return (
    <header className="flex min-h-20 items-center justify-between gap-3 border-b bg-surface px-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavigation brand={brand} />
        <span className="hidden text-sm text-muted-foreground sm:inline">
          Cabinet<span className="mx-3 text-border">/</span>
        </span>
        <span className="truncate text-sm font-semibold">{title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground">
          Démonstration
        </span>
        <span className="hidden border-l pl-4 text-sm font-medium md:inline">
          Espace cabinet
        </span>
      </div>
    </header>
  );
}
