"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";

export function InvoiceConfirmation({ title, description, label, busy, children, close, confirm }: {
  title: string; description: string; label: string; busy: boolean; children: ReactNode; close(): void; confirm(): void;
}) {
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close(); }}>
      <DialogPanel className="max-w-2xl"
        footer={<>
          <Dialog.Close asChild><Button variant="outline" disabled={busy}>Annuler</Button></Dialog.Close>
          <Button disabled={busy} onClick={confirm} aria-busy={busy}>{busy ? "Enregistrement…" : label}</Button>
        </>}
        onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
        <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
        <Dialog.Description className="text-sm leading-6 text-muted-foreground">{description}</Dialog.Description>
        {children}
      </DialogPanel>
  </Dialog.Root>;
}
