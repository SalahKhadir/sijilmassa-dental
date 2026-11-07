import { searchPatients } from "../patients/directory.ts";
import type {
  Prescription,
  PrescriptionPatient,
  PrescriptionStatus,
} from "./types.ts";
export interface PrescriptionQuery {
  search: string;
  status: "all" | PrescriptionStatus;
  from: string;
  to: string;
  sort: "newest" | "oldest";
  patientId?: string;
  consultationId?: string;
}
export function filterPrescriptions(
  records: readonly Prescription[],
  patients: readonly PrescriptionPatient[],
  query: PrescriptionQuery,
) {
  const ids = new Set(
    searchPatients(patients, query.search).map((patient) => patient.id),
  );
  return records
    .filter(
      (record) =>
        ids.has(record.patientId) &&
        (!query.patientId || record.patientId === query.patientId) &&
        (!query.consultationId ||
          record.consultationId === query.consultationId) &&
        (query.status === "all" || record.status === query.status) &&
        (!query.from || record.issuedDate >= query.from) &&
        (!query.to || record.issuedDate <= query.to),
    )
    .sort(
      (a, b) =>
        (a.issuedDate.localeCompare(b.issuedDate) || a.id.localeCompare(b.id)) *
        (query.sort === "newest" ? -1 : 1),
    );
}
