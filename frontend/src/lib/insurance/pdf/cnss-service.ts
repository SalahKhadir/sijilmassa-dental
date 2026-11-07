import { CnssPdfError, renderCnssPdf, type CnssPdfInput } from "./cnss-renderer";
async function asset(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new CnssPdfError("Une ressource du PDF CNSS est indisponible. Rechargez la page puis réessayez.");
  return new Uint8Array(await response.arrayBuffer());
}
export async function generateCnssPdf(input: CnssPdfInput) {
  const [template, font] = await Promise.all([
    asset("/pdf-templates/feuille_dentaire_CNSS.pdf"),
    asset("/fonts/LiberationSans-Regular.ttf"),
  ]);
  return renderCnssPdf(input, { template, font });
}
