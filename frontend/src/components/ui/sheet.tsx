"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetTitle = Dialog.Title;
export const SheetDescription = Dialog.Description;
export function SheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Dialog.Content>) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 lg:hidden" />
      <Dialog.Content
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(20rem,90vw)] flex-col overflow-y-auto bg-surface p-5 shadow-xl lg:hidden",
          className,
        )}
        {...props}
      >
        {children}
        <Dialog.Close className="absolute top-5 right-4 rounded-md p-2 text-muted-foreground hover:bg-muted">
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">Fermer le menu</span>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
