import type { Prescription } from "../lib/prescriptions/types.ts";
/** Imaginary labels only. No drug, dose, or medication recommendation is supplied. */
export const prescriptionFixtures: readonly Prescription[] = Array.from(
  { length: 8 },
  (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    const id = `prescription-demo-${number}`;
    const issuedDate = `2026-11-${String((index % 7) + 1).padStart(2, "0")}`;
    const timestamp = `${issuedDate}T10:00:00.000Z`;
    const finalized = index % 2 === 1;
    return {
      id,
      patientId: `patient-demo-${number}`,
      consultationId: index % 3 ? `consultation-demo-${number}` : "",
      issuedDate,
      status: finalized ? "FINALISEE" : "BROUILLON",
      medications: [
        {
          id: `${id}-med-1`,
          medicationName: `Produit fictif ${index + 1} — démonstration`,
          dosage: "Posologie fictive à saisir par le dentiste",
          frequency: finalized ? "Fréquence fictive de démonstration" : "",
          duration: finalized ? "Durée fictive de démonstration" : "",
          instructions: "Exemple de saisie sans valeur thérapeutique.",
        },
      ],
      generalInstructions: "Document de démonstration sur données fictives.",
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(finalized ? { finalizedAt: timestamp } : {}),
    };
  },
);
