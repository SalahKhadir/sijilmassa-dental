"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { navigation } from "@/lib/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { roleLabels } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { MobileNavigation } from "./mobile-navigation";
export function TopBar({ brand }: { brand: ReactNode }) {
  const path = usePathname();
  const { state, signOut } = useAuth();
  const title =
    navigation.find(
      (item) =>
        item.href === path ||
        (item.href !== "/" && path.startsWith(`${item.href}/`)),
    )?.label ?? "Page introuvable";
  return (
    <header className="flex min-h-16 items-center justify-between gap-2 border-b bg-surface px-4 sm:gap-3 sm:px-8 xl:px-10">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <MobileNavigation brand={brand} />
        <span className="hidden text-sm text-muted-foreground sm:inline">
          Cabinet<span className="mx-3 text-border">/</span>
        </span>
        <span className="text-sm font-semibold [overflow-wrap:anywhere]">{title}</span>
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
        <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {state.status === "authenticated" ? roleLabels[state.user.role] : "Session"}
        </span>
        <span className="hidden max-w-40 truncate border-l pl-4 text-sm font-medium md:inline">
          {state.status === "authenticated" ? state.user.username : ""}
        </span>
        <Button variant="ghost" className="min-w-11 px-0 sm:px-3" onClick={() => void signOut()}>
          <LogOut aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Se déconnecter</span>
        </Button>
      </div>
    </header>
  );
}
