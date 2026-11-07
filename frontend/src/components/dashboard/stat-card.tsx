import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
export function StatCard({
  title,
  value,
  detail,
  icon: Icon,
  primary = false,
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  primary?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 sm:pt-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <span
            className={
              primary
                ? "rounded-lg bg-primary-tint p-2 text-primary"
                : "rounded-lg bg-secondary-tint p-2 text-secondary"
            }
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums">
          {value}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
