"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
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
        <Dialog.Close asChild>
          <Button variant="ghost" size="icon" className="absolute top-4 right-4" aria-label="Fermer le menu">
            <X aria-hidden="true" />
          </Button>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
