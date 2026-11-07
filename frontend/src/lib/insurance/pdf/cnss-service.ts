import { CnssPdfError, renderCnssPdf, type CnssPdfInput } from "./cnss-renderer";
import { loadInsurancePdfAssets } from "./assets";
export async function generateCnssPdf(input: CnssPdfInput) {
  return renderCnssPdf(input, await loadInsurancePdfAssets("CNSS", CnssPdfError));
}
