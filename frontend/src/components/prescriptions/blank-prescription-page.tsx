import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { PdfPreview } from "./pdf-preview";
export function BlankPrescriptionPage({ backHref = "/documents" }: { backHref?: string }) {
  return (
    <>
      <PageHeading
        eyebrow="Documents du cabinet"
        title="Ordonnance vierge A5"
        description="Imprimez le modèle officiel pour une saisie manuscrite."
      >
        <Button asChild variant="outline">
          <Link href={backHref}>Retour aux documents</Link>
        </Button>
      </PageHeading>
      <p className="text-sm leading-6 text-muted-foreground">
        Cette impression conserve le modèle d’origine et ne crée pas
        d’ordonnance dans un dossier patient.
      </p>
      <PdfPreview />
    </>
  );
}
