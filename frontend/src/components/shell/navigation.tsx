"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UsersRound,
  CalendarDays,
  Stethoscope,
  ReceiptText,
  Files,
  Settings2,
} from "lucide-react";
import { navigation } from "@/lib/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { canAccessPath } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
const icons = {
  dashboard: LayoutDashboard,
  patients: UsersRound,
  calendar: CalendarDays,
  consultations: Stethoscope,
  billing: ReceiptText,
  documents: Files,
  settings: Settings2,
};
export function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  return (
    <nav aria-label="Navigation principale" className="space-y-1">
      {navigation.filter((item) => canAccessPath(state.user.role, item.href)).map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = icons[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg border-l-[3px] px-3 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary-tint text-primary"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-[19px] shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
