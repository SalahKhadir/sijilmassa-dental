import type { Patient } from "./types.ts";

export function maskCIN(cin: string): string {
  return cin ? "•••••• (masquée)" : "Non renseignée";
}
/** Presentation projection only. Real access control belongs to the future API. */
export function patientDirectoryEntry(patient: Patient) {
  return {
    id: patient.id,
    reference: patient.reference,
    identity: {
      firstName: patient.identity.firstName,
      lastName: patient.identity.lastName,
      sex: patient.identity.sex,
      dateOfBirth: patient.identity.dateOfBirth,
      gsm: patient.identity.gsm,
    },
    status: patient.status,
    createdAt: patient.createdAt,
  };
}
export type PatientDirectoryEntry = ReturnType<typeof patientDirectoryEntry>;
