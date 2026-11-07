import { InsurancePdfError } from "./errors";
export async function loadInsurancePdfAssets(provider: "CNSS" | "CNOPS" | "FAR", ErrorClass: typeof InsurancePdfError) {
  async function asset(path: string) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new ErrorClass(`Une ressource du PDF ${provider} est indisponible. Rechargez la page puis réessayez.`);
    return new Uint8Array(await response.arrayBuffer());
  }
  const [template, font] = await Promise.all([
    asset(`/pdf-templates/feuille_dentaire_${provider}.pdf`),
    asset("/fonts/LiberationSans-Regular.ttf"),
  ]);
  return { template, font };
}
