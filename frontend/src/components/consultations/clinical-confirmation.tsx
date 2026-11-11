"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
export function ClinicalConfirmation({
  open,
  title,
  description,
  confirmLabel,
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
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
        <Dialog.Content
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-surface p-6 shadow-xl"
        >
          <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
            {description}
          </Dialog.Description>
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={busy}>
                Annuler
              </Button>
            </Dialog.Close>
            <Button onClick={onConfirm} disabled={busy || confirmDisabled}>
              {busy ? "Enregistrement…" : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
