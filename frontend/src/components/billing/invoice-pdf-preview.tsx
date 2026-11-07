"use client";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Invoice, Payment } from "@/lib/billing/types";
import { InvoicePdfError } from "@/lib/billing/pdf-layout";

interface ReadyPdf {
  url: string;
  filename: string;
}

export function InvoicePdfPreview({
  invoice,
  payments,
  patient,
}: {
  invoice: Invoice;
  payments: readonly Payment[];
  patient: { name: string; reference: string };
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState("");
  const [printMessage, setPrintMessage] = useState("");
  const [response, setResponse] = useState<{
    invoice: Invoice;
    payments: readonly Payment[];
    patient: typeof patient;
    attempt: number;
    result: ReadyPdf | Error;
  } | null>(null);
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    async function generate() {
      try {
        const { invoicePdfService } = await import("@/lib/billing/pdf-service");
        const bytes = await invoicePdfService.render(
          invoice,
          payments,
          patient,
        );
        if (!active) return;
        url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }),
        );
        setResponse({
          invoice,
          payments,
          patient,
          attempt,
          result: {
            url,
            filename: invoice.invoiceNumber
              ? `facture-${invoice.invoiceNumber}.pdf`
              : `facture-${invoice.id}-brouillon.pdf`,
          },
        });
      } catch (error) {
        if (active)
          setResponse({
            invoice,
            payments,
            patient,
            attempt,
            result:
              error instanceof InvoicePdfError
                ? error
                : new Error("Impossible de générer le PDF. Réessayez."),
          });
      }
    }
    void generate();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [invoice, payments, patient, attempt]);
  const result =
    response?.invoice === invoice &&
    response?.payments === payments &&
    response?.patient === patient &&
    response?.attempt === attempt
      ? response.result
      : null;
  return (
    <Card id="pdf" className="scroll-mt-6">
      <CardHeader className="border-b">
        <CardTitle>Aperçu de la facture</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Fond officiel · Page A5 · Données fictives du prototype
        </p>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {!result ? (
          <p role="status">Préparation du PDF…</p>
        ) : result instanceof Error ? (
          <div className="space-y-4">
            <p role="alert" className="text-sm leading-6 text-danger">
              {result.message}
            </p>
            <Button onClick={() => setAttempt((value) => value + 1)}>
              Réessayer la génération
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <a
                className={buttonVariants({ variant: "outline" })}
                href={result.url}
                download={result.filename}
              >
                Télécharger le PDF
              </a>
              <Button
                disabled={loadedUrl !== result.url}
                onClick={() => {
                  setPrintMessage("");
                  try {
                    const viewer = frame.current?.contentWindow;
                    if (!viewer) throw new Error();
                    viewer.focus();
                    viewer.print();
                    setPrintMessage(
                      "La demande d’impression a été envoyée au navigateur.",
                    );
                  } catch {
                    setPrintMessage(
                      "Ouvrez le PDF dans un nouvel onglet pour l’imprimer.",
                    );
                  }
                }}
              >
                Imprimer
              </Button>
              <a
                className={buttonVariants({ variant: "ghost" })}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ouvrir dans un nouvel onglet
              </a>
            </div>
            {printMessage && (
              <p role="status" className="text-sm leading-6">
                {printMessage}
              </p>
            )}
            <iframe
              ref={frame}
              title="Aperçu PDF de la facture"
              src={`${result.url}#view=FitH&navpanes=0`}
              onLoad={() => setLoadedUrl(result.url)}
              className="h-[65vh] min-h-96 w-full rounded-lg border bg-muted"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Choisissez le format A5 et la taille réelle dans la fenêtre
              d’impression. Ce PDF de démonstration n’est pas présenté comme une
              facture légalement certifiée.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
