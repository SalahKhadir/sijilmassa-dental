import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-28 w-full min-w-0 resize-y rounded-lg border border-input bg-surface px-3.5 py-3 text-base text-foreground transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger aria-invalid:outline-danger",
        className,
      )}
      {...props}
    />
  );
}
