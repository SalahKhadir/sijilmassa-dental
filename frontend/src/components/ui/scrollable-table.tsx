import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

export function ScrollableTable({ label, className, ...props }: ComponentProps<"table"> & { label: string }) {
  return (
    <Card role="region" aria-label={label} tabIndex={0} className="min-w-0 overflow-x-auto focus-visible:-outline-offset-2">
      <table className={cn("data-table", className)} {...props} />
    </Card>
  );
}
