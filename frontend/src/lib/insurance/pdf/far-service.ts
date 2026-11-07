import { loadInsurancePdfAssets } from "./assets";
import { FarPdfError } from "./errors";
import { renderFarPdf } from "./far-renderer";
import type { InsurancePdfInput } from "./overlay";
export async function generateFarPdf(input: InsurancePdfInput) {
  return renderFarPdf(input, await loadInsurancePdfAssets("FAR", FarPdfError));
}
