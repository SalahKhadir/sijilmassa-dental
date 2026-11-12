"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { savePdfDownload } from "@/lib/api/pdf-download";
import { InsuranceApiError, type InsuranceApi } from "@/lib/insurance/api/client";
import type { InsuranceDetail } from "@/lib/insurance/api/schemas";

const printable = {
  CNSS_DENTAIRE: "9f829b1a26545a979e5cc94075307822aac95295529d572bfee17a82e5d51609",
  CNOPS_DENTAIRE: "255e712e12aa0642c79ee6789e8e03c587425c6d4186f58e8fe094985b45efef",
};

export function InsurancePdfActions({ detail, api }: { detail: InsuranceDetail; api: InsuranceApi }) {
  const active = useRef(false);
  const running = useRef(false);
  const url = useRef<string>(null);
  const printButton = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);

  if (detail.lifecycle !== "FINALISE") return null;
  if (detail.documentType === "FAR_DENTAIRE") {
    return <p role="status">PDF FAR indisponible. La référence de compte et les frais à déclarer restent à confirmer.
      {detail.purpose === "RECUS" && " La preuve de paiement doit aussi être définie pour les reçus."}</p>;
  }
  if (detail.snapshot?.templateSha256 !== printable[detail.documentType]) {
    return <p role="status">Cette version du formulaire PDF n’est pas prise en charge.</p>;
  }

  async function prepare(print: boolean) {
    if (running.current || document.documentElement.dataset.authBlocked === "true") return;
    running.current = true;
    setPending(true);
    setError("");
    try {
      const file = await api.pdf(detail.patientId, detail.documentId);
      if (!active.current || document.documentElement.dataset.authBlocked === "true") return;
      if (print) {
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(file.blob);
        setPreview(url.current);
      } else {
        savePdfDownload(file);
      }
    } catch (failure) {
      if (active.current && document.documentElement.dataset.authBlocked !== "true") {
        setError(failure instanceof InsuranceApiError ? failure.message : "Le formulaire PDF n’a pas pu être téléchargé.");
      }
    } finally {
      running.current = false;
      if (active.current) setPending(false);
    }
  }

  function close() {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setPreview(undefined);
    printButton.current?.focus();
  }

  return <section className="space-y-3" aria-label="Formulaire PDF d’assurance">
    <p className="text-sm text-muted-foreground">Formulaire prérempli à compléter sur papier. Les montants facturés ou déclarés, signatures et cachets restent à renseigner.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={pending} onClick={() => void prepare(false)}>Télécharger le formulaire PDF</Button>
      <Button ref={printButton} type="button" variant="outline" disabled={pending} onClick={() => void prepare(true)}>Imprimer le formulaire</Button>
    </div>
    {pending && <p role="status">Préparation du formulaire PDF…</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <div className="space-y-3 rounded-lg border p-3">
      <p>Dans le lecteur PDF, sélectionnez la taille réelle et vérifiez que les deux pages tiennent sur le papier choisi.</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><a href={preview} target="_blank" rel="noopener noreferrer">Ouvrir le PDF dans un nouvel onglet</a></Button>
        <Button type="button" variant="outline" onClick={close}>Fermer l’aperçu</Button>
      </div>
      <iframe title="Aperçu du formulaire PDF d’assurance" src={preview} className="h-[65vh] w-full rounded-lg border" />
    </div>}
  </section>;
}
