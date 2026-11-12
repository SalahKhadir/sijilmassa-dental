import { readPdfDownload, savePdfDownload } from "../../api/pdf-download";
import { PrescriptionApiError } from "./errors";

/** Uses the immutable backend bytes. No renderer, template or font dependencies. */
export function prescriptionPdf(response: Response, id: string) {
  return readPdfDownload(response, `ordonnance-${id.toLowerCase()}.pdf`, "X-Prescription-PDF-Bytes", () => new PrescriptionApiError(502));
}

export { savePdfDownload as savePrescriptionPdf };
