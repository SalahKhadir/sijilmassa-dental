import { normalizeSearch } from "../patients/directory.ts";
import type { Patient } from "../patients/types.ts";
import type { Consultation, ConsultationStatus } from "./types.ts";
export type ClinicalPatient = Pick<Patient, "id" | "reference" | "identity">;
export function consultationDirectory(
  records: readonly Consultation[],
  patients: readonly ClinicalPatient[],
  query: {
    search: string;
    status: "all" | ConsultationStatus;
    sort: "newest" | "oldest";
    patientId?: string;
  },
) {
  const words = normalizeSearch(query.search).split(" ").filter(Boolean);
  return records
    .filter((record) => {
      const patient = patients.find((item) => item.id === record.patientId);
      const identity = normalizeSearch(
        `${patient?.reference ?? ""} ${patient?.identity.firstName ?? ""} ${patient?.identity.lastName ?? ""}`,
      );
      return (
        (!query.patientId || record.patientId === query.patientId) &&
        (query.status === "all" || record.status === query.status) &&
        words.every((word) => identity.includes(word))
      );
    })
    .sort(
      (a, b) =>
        (a.consultationDate.localeCompare(b.consultationDate) ||
          a.id.localeCompare(b.id)) * (query.sort === "newest" ? -1 : 1),
    );
}
export function chronologicalTreatments(record: Consultation) {
  return [...record.treatments].sort(
    (a, b) =>
      a.treatmentDate.localeCompare(b.treatmentDate) ||
      a.id.localeCompare(b.id),
  );
}
