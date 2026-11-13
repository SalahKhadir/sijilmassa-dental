import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn("form-control min-h-28 resize-y py-3 read-only:bg-muted", className)}
      {...props}
    />
  );
}
