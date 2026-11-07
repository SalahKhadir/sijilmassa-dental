import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        "min-h-12 w-full min-w-0 rounded-lg border border-input bg-surface px-3.5 py-3 text-base text-foreground transition-colors placeholder:text-muted-foreground hover:border-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger aria-invalid:outline-danger",
        className,
      )}
      {...props}
    />
  );
}
