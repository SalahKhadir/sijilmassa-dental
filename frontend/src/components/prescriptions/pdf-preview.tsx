"use client";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PrescriptionPdfError } from "@/lib/prescriptions/pdf/layout";
import type {
  Prescription,
  PrescriptionPatient,
} from "@/lib/prescriptions/types";
interface ReadyPdf {
  url: string;
  filename: string;
}
export function PdfPreview({
  prescription,
  patient,
}: {
  prescription?: Prescription;
  patient?: PrescriptionPatient;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState("");
  const [printMessage, setPrintMessage] = useState("");
  const [response, setResponse] = useState<{
    prescription: typeof prescription;
    patient: typeof patient;
    attempt: number;
    result: ReadyPdf | Error;
  } | null>(null);
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    async function generate() {
      try {
        const { prescriptionPdfService } = await import(
          "@/lib/prescriptions/pdf/service"
        );
        const bytes =
          prescription && patient
            ? await prescriptionPdfService.render(prescription, patient)
            : await prescriptionPdfService.blank();
        if (!active) return;
        url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }),
        );
        setResponse({
          prescription,
          patient,
          attempt,
          result: {
            url,
            filename: prescription
              ? `${prescription.id}-${prescription.status.toLowerCase()}.pdf`
              : "ordonnance-vierge-a5.pdf",
          },
        });
      } catch (error) {
        if (active)
          setResponse({
            prescription,
            patient,
            attempt,
            result:
              error instanceof PrescriptionPdfError
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
  }, [prescription, patient, attempt]);
  const result =
    response?.prescription === prescription &&
    response?.patient === patient &&
    response?.attempt === attempt
      ? response.result
      : null;
  return (
    <Card id="pdf" className="scroll-mt-6">
      <CardHeader className="border-b">
        <CardTitle>Aperçu PDF</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Modèle officiel A5 · Dimensions conservées, environ 147,90 × 210,08
          mm.
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
                      "La demande d’impression a été envoyée au navigateur. Si la fenêtre ne s’ouvre pas, ouvrez le PDF dans un nouvel onglet.",
                    );
                  } catch {
                    setPrintMessage(
                      "Ouvrez le PDF dans un nouvel onglet pour utiliser la commande d’impression du lecteur.",
                    );
                  }
                }}
              >
                Imprimer le PDF
              </Button>
              <a
                className={buttonVariants({ variant: "ghost" })}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ouvrir le PDF dans un nouvel onglet
              </a>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Dans la fenêtre d’impression, choisissez A5 et une échelle de 100
              % ou « Taille réelle ». Les formats proposés dépendent du
              navigateur et du pilote d’imprimante.
            </p>
            {printMessage && (
              <p role="status" className="text-sm leading-6">
                {printMessage}
              </p>
            )}
            <iframe
              ref={frame}
              title={
                prescription
                  ? "Aperçu PDF de l’ordonnance"
                  : "Aperçu de l’ordonnance vierge A5"
              }
              src={`${result.url}#view=FitH&navpanes=0`}
              onLoad={() => setLoadedUrl(result.url)}
              className="h-[65vh] min-h-96 w-full rounded-lg border bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Si votre navigateur n’affiche pas l’aperçu, utilisez le lien de
              téléchargement ou ouvrez le PDF dans un nouvel onglet.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
