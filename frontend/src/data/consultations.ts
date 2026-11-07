import type { Consultation } from "../lib/consultations/types.ts";
/** Deterministic synthetic encounters. Identities and questionnaire stay in PatientRepository. */
export const consultationFixtures: readonly Consultation[] = Array.from(
  { length: 20 },
  (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    const patientNumber = String((index % 15) + 1).padStart(3, "0");
    const id = `consultation-demo-${number}`;
    const linkedDates: Record<number, string> = {
      2: "2026-11-03",
      6: "2026-11-06",
      9: "2026-11-07",
    };
    const consultationDate =
      linkedDates[index] ?? `2026-10-${String(index + 5).padStart(2, "0")}`;
    const timestamp = `${consultationDate}T09:00:00.000Z`;
    const completed = index % 3 !== 0;
    return {
      id,
      patientId: `patient-demo-${patientNumber}`,
      appointmentId: linkedDates[index] ? `appointment-demo-${number}` : "",
      consultationDate,
      chiefComplaint: [
        "Visite de contrôle fictive",
        "Gêne rapportée · exemple fictif",
        "Suivi de soins fictif",
      ][index % 3],
      clinicalObservations: completed
        ? "Observations de démonstration saisies pour cet exemple."
        : "",
      assessment: "",
      treatmentPlan: "",
      notes: "Données entièrement fictives.",
      status: completed ? "TERMINEE" : "BROUILLON",
      createdAt: timestamp,
      updatedAt: timestamp,
      treatments: completed
        ? [
            {
              id: `${id}-care-1`,
              consultationId: id,
              treatmentDate: consultationDate,
              description: "Soin de démonstration consigné pour cet exemple.",
              toothReference: "",
              notes: "",
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ]
        : [],
    };
  },
);
