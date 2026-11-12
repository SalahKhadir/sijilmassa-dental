"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function InvoiceConfirmation({ title, description, label, busy, children, close, confirm }: {
  title: string; description: string; label: string; busy: boolean; children: ReactNode; close(): void; confirm(): void;
}) {
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
      <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-xl border bg-surface p-5 shadow-xl"
        onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
        <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
        <Dialog.Description className="text-sm text-muted-foreground">{description}</Dialog.Description>
        {children}
        <div className="flex flex-wrap justify-end gap-2">
          <Dialog.Close asChild><Button variant="outline" disabled={busy}>Annuler</Button></Dialog.Close>
          <Button disabled={busy} onClick={confirm}>{busy ? "Enregistrement…" : label}</Button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
