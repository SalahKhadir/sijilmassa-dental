"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DialogPanel({
  children,
  footer,
  className,
  ...props
}: ComponentProps<typeof Dialog.Content> & { footer: ReactNode }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
      <Dialog.Content
        className={cn("fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-surface shadow-xl", className)}
        {...props}
      >
        <div
          role="region"
          aria-label="Détails de la confirmation"
          tabIndex={0}
          className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 [overflow-wrap:anywhere] focus-visible:-outline-offset-2 sm:p-6"
        >
          {children}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-surface p-3 sm:px-6">
          {footer}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
