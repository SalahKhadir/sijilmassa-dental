import type { Invoice, Payment } from "./types";
import { renderInvoicePdf } from "./pdf-renderer";
import { InvoicePdfError } from "./pdf-layout";

export { clinicFinancialIdentifiers, clinicIdentity } from "./pdf-config";

async function localAsset(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok)
    throw new InvoicePdfError(
      "Une ressource du PDF est indisponible. Rechargez la page puis réessayez.",
    );
  return new Uint8Array(await response.arrayBuffer());
}

export interface InvoicePdfService {
  render(
    invoice: Invoice,
    payments: readonly Payment[],
    patient: { name: string; reference: string },
  ): Promise<Uint8Array>;
}

export const invoicePdfService: InvoicePdfService = {
  async render(invoice, payments, patient) {
    const [background, font, boldFont] = await Promise.all([
      localAsset("/pdf-templates/facture_background.png"),
      localAsset("/fonts/LiberationSans-Regular.ttf"),
      localAsset("/fonts/LiberationSans-Bold.ttf").catch(() => undefined),
    ]);
    return renderInvoicePdf(invoice, payments, patient, {
      background,
      font,
      boldFont,
    });
  },
};
