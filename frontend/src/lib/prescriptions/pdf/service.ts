import type { Prescription, PrescriptionPatient } from "../types";
import {
  blankPrescriptionPdf,
  renderPrescriptionPdf,
  PrescriptionPdfError,
} from "./renderer";
async function localAsset(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok)
    throw new PrescriptionPdfError(
      "Une ressource du PDF est indisponible. Réessayez après avoir rechargé la page.",
    );
  return new Uint8Array(await response.arrayBuffer());
}
export interface PrescriptionPdfService {
  blank(): Promise<Uint8Array>;
  render(
    record: Prescription,
    patient: PrescriptionPatient,
  ): Promise<Uint8Array>;
}
export const prescriptionPdfService: PrescriptionPdfService = {
  async blank() {
    return blankPrescriptionPdf(
      await localAsset("/pdf-templates/ordonnance-a5.pdf"),
    );
  },
  async render(record, patient) {
    const [template, font] = await Promise.all([
      localAsset("/pdf-templates/ordonnance-a5.pdf"),
      localAsset("/fonts/LiberationSans-Regular.ttf"),
    ]);
    return renderPrescriptionPdf(record, patient, { template, font });
  },
};
