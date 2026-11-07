import { insuranceDraftSchema, policySchema } from "../schema.ts";
import { isCalendarDate } from "../../patients/dates.ts";
import { FarPdfError } from "./errors.ts";
import type { InsurancePdfInput } from "./overlay.ts";

export function validateFarInput({ draft, patient, policy }: InsurancePdfInput) {
  const parsed = insuranceDraftSchema.safeParse(draft);
  if (!parsed.success) {
    if (parsed.error.issues.some(issue => issue.path.includes("totalFeesMinor")))
      throw new FarPdfError("Le total des frais est invalide ou diffère des actes. Corrigez les montants.");
    if (parsed.error.issues.some(issue => issue.path.includes("toothMarks")))
      throw new FarPdfError("Vérifiez les dents FAR : références FDI uniques et symboles explicites uniquement.");
    throw new FarPdfError("Vérifiez les champs du brouillon FAR avant de générer le PDF.");
  }
  if (draft.provider !== "FAR") throw new FarPdfError("Sélectionnez un brouillon FAR.");
  if (patient.id !== draft.patientId || !patient.identity.firstName.trim() || !patient.identity.lastName.trim())
    throw new FarPdfError("Renseignez le bénéficiaire correspondant au brouillon FAR.");
  if (!policy || !policySchema.safeParse(policy).success || policy.id !== draft.policyId || policy.patientId !== patient.id || policy.provider !== "FAR")
    throw new FarPdfError("Associez la couverture FAR de ce patient au brouillon.");
  const insured = policy.insuredPerson;
  if (insured.relationship === "AUTRE" || insured.isPatient !== (insured.relationship === "LUI_MEME"))
    throw new FarPdfError("Vérifiez le lien FAR : adhérent, conjoint ou enfant, en accord avec l’identité de l’assuré.");
  for (const [label, value] of [
    ["CIN de l’adhérent", insured.cin], ["N° de compte FAR", policy.militaryAccountNumber],
    ["Téléphone de l’adhérent", insured.phone], ["Grade", policy.militaryRank],
    ["Unité", policy.militaryUnit], ["Adresse de l’adhérent", insured.address],
  ]) if (!value?.trim()) throw new FarPdfError(`${label} : renseignez ce champ dans la couverture FAR du patient.`);
  if (!isCalendarDate(patient.identity.dateOfBirth))
    throw new FarPdfError("Renseignez une date de naissance valide pour le bénéficiaire.");
  const details = parsed.data.farDetails;
  if (!details?.dentalPurpose) throw new FarPdfError("Choisissez explicitement Devis ou Reçus sur la feuille FAR.");
  if (!details.careType) throw new FarPdfError("Choisissez explicitement Soins ou Prothèse sur la feuille FAR.");
  if (!details.context) throw new FarPdfError("Choisissez explicitement le contexte FAR : maladie, maternité ou accident.");
  if (!details.practitionerInpe || !/^\d{9}$/.test(details.practitionerInpe))
    throw new FarPdfError("Renseignez les neuf chiffres de l’INPE vérifié du médecin dentiste. L’INP n’est pas repris automatiquement.");
  if (details.prospectusCount === undefined || draft.manualFields.attachmentCount === undefined)
    throw new FarPdfError("Renseignez le nombre de prospectus et de pièces jointes, même lorsqu’il est égal à zéro.");
  if (!isCalendarDate(draft.manualFields.declarationDate ?? ""))
    throw new FarPdfError("Renseignez une date de déclaration FAR valide.");
  if (!draft.acts.length || draft.acts.length > 5)
    throw new FarPdfError("Le formulaire FAR accepte de 1 à 5 actes communs aux deux volets. Répartissez les actes sur plusieurs feuilles.");
  draft.acts.forEach((act, index) => {
    if (!isCalendarDate(act.treatmentDate)) throw new FarPdfError(`Acte ${index + 1} : saisissez une date de soin valide.`);
    if (act.amountMinor === undefined) throw new FarPdfError(`Acte ${index + 1} : renseignez les honoraires réellement enregistrés, y compris zéro si applicable.`);
  });
  const marks = details.toothMarks ?? [];
  for (const mark of marks) if (!mark.symbol)
    throw new FarPdfError(`Dent ${mark.tooth} : le dentiste doit choisir explicitement Cercle ou Croix selon la notice FAR.`);
  if (marks.length && details.markingApproved !== true)
    throw new FarPdfError("Le dentiste doit confirmer les symboles FAR avant de générer un PDF marqué.");
  return { policy, details };
}
