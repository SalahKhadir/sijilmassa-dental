import { insuranceDraftSchema, policySchema } from "../schema.ts";
import { isCalendarDate } from "../../patients/dates.ts";
import { CnopsPdfError } from "./errors.ts";
import type { InsurancePdfInput } from "./overlay.ts";

export function validateCnopsInput({ draft, patient, policy }: InsurancePdfInput) {
  const parsed = insuranceDraftSchema.safeParse(draft);
  if (!parsed.success) {
    if (parsed.error.issues.some(issue => issue.path.includes("practitionerInpe")))
      throw new CnopsPdfError("L’INPE doit comporter neuf chiffres. Corrigez l’identifiant du médecin dentiste.");
    throw new CnopsPdfError("Vérifiez les champs du brouillon CNOPS avant de générer le PDF.");
  }
  if (draft.provider !== "CNOPS") throw new CnopsPdfError("Sélectionnez un brouillon CNOPS.");
  if (patient.id !== draft.patientId || !patient.identity.firstName.trim() || !patient.identity.lastName.trim())
    throw new CnopsPdfError("Renseignez le bénéficiaire correspondant au brouillon.");
  if (!policy || !policySchema.safeParse(policy).success || policy.id !== draft.policyId || policy.patientId !== patient.id || policy.provider !== "CNOPS")
    throw new CnopsPdfError("Associez une couverture CNOPS à ce patient.");
  if (!policy.affiliationNumber?.trim() || !policy.registrationNumber?.trim())
    throw new CnopsPdfError("Renseignez les numéros d’affiliation et d’immatriculation dans la couverture CNOPS.");
  const insured = policy.insuredPerson;
  if (insured.relationship === "AUTRE")
    throw new CnopsPdfError("Précisez le lien CNOPS : conjoint, enfant ou lui-même. Aucune case « Autre » n’est imprimée.");
  if (insured.isPatient !== (insured.relationship === "LUI_MEME"))
    throw new CnopsPdfError("Vérifiez la concordance entre l’assuré et le lien de parenté.");
  const details = parsed.data.cnopsDetails;
  if (!details?.practitionerInpe || !/^\d{9}$/.test(details.practitionerInpe))
    throw new CnopsPdfError("Renseignez l’INPE confirmé du médecin dentiste : neuf chiffres. Le numéro INP ne le remplace pas automatiquement.");
  if (!draft.acts.length || draft.acts.length > 9)
    throw new CnopsPdfError("Le modèle CNOPS accepte de 1 à 9 actes. Répartissez les actes sur plusieurs feuilles.");
  draft.acts.forEach((act, index) => {
    if (!isCalendarDate(act.treatmentDate))
      throw new CnopsPdfError(`Acte ${index + 1} : saisissez une date de soin valide.`);
  });
  const diagnosis = details.diagnosisCodeCIM10;
  if (diagnosis && !/^[A-Z][0-9]{2}$/.test(diagnosis))
    throw new CnopsPdfError("Le champ CIM-10 du modèle comporte trois cases (une majuscule et deux chiffres). Vérifiez le code à porter sur ce formulaire ; aucun code détaillé n’est abrégé automatiquement.");
  return { policy, details };
}
