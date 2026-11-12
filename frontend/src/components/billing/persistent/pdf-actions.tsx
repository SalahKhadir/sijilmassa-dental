"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { savePdfDownload } from "@/lib/api/pdf-download";
import { requireLogin } from "@/lib/api/session-request";
import { fetchInvoicePdf, InvoicePdfDownloadError } from "@/lib/invoices/pdf-download";

export function InvoicePdfActions({ patientId, invoiceId, number }: { patientId: string; invoiceId: string; number: string }) {
  const request = useRef<AbortController>(null);
  const url = useRef<string>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string>();
  const printButton = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => () => {
    request.current?.abort();
    if (url.current) URL.revokeObjectURL(url.current);
  }, []);

  async function prepare(print: boolean) {
    if (request.current || document.documentElement.dataset.authBlocked === "true") return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    try {
      const file = await fetchInvoicePdf({ patientId, invoiceId, number }, controller.signal, () => {
        if (!controller.signal.aborted) requireLogin();
      });
      if (controller.signal.aborted || document.documentElement.dataset.authBlocked === "true") return;
      if (!print) {
        savePdfDownload(file);
        return;
      }
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(file.blob);
      setPreview(url.current);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof InvoicePdfDownloadError
        ? failure.message : "Le PDF de la facture n’a pas pu être téléchargé. Réessayez.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  }

  function close() {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setPreview(undefined);
    printButton.current?.focus();
  }

  return <section className="space-y-3" aria-label="PDF de la facture">
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={pending} onClick={() => void prepare(false)}>Télécharger la facture</Button>
      <Button ref={printButton} type="button" variant="outline" disabled={pending}
        onClick={() => void prepare(true)}>Imprimer la facture</Button>
    </div>
    {pending && <p role="status">Préparation du PDF…</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <div className="space-y-3 rounded-lg border p-3">
      <p>Dans le lecteur PDF, choisissez le format A5 et la taille réelle.</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><a href={preview} target="_blank" rel="noopener noreferrer">Ouvrir le PDF dans un nouvel onglet</a></Button>
        <Button type="button" variant="outline" onClick={close}>Fermer l’aperçu</Button>
      </div>
      <iframe title="Aperçu PDF de la facture originale" src={preview} className="h-[65vh] w-full rounded-lg border" />
    </div>}
  </section>;
}
