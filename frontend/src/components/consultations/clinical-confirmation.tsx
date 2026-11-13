"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";
export function ClinicalConfirmation({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  busy = false,
  confirmDisabled = false,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  error?: string;
  onOpenChange(open: boolean): void;
  onConfirm(): void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
        <DialogPanel
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          footer={<>
            <Dialog.Close asChild>
              <Button variant="outline" disabled={busy}>Annuler</Button>
            </Dialog.Close>
            <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={busy || confirmDisabled} aria-busy={busy}>
              {busy ? "Enregistrement…" : confirmLabel}
            </Button>
          </>}
        >
          <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="text-sm leading-6 text-muted-foreground">
            {description}
          </Dialog.Description>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </DialogPanel>
    </Dialog.Root>
  );
}
