import { loadInsurancePdfAssets } from "./assets";
import { CnopsPdfError } from "./errors";
import { renderCnopsPdf } from "./cnops-renderer";
import type { InsurancePdfInput } from "./overlay";
export async function generateCnopsPdf(input: InsurancePdfInput) {
  return renderCnopsPdf(input, await loadInsurancePdfAssets("CNOPS", CnopsPdfError));
}
