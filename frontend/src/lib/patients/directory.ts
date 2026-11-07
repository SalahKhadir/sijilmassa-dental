import { clinicDate } from "./dates.ts";
import type { Patient, PatientStatus } from "./types.ts";

export type PatientSort = "name" | "newest" | "oldest";
export interface PatientDirectoryQuery {
  search: string;
  status: "all" | PatientStatus;
  sort: PatientSort;
  page: number;
  pageSize: number;
}
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr")
    .trim()
    .replace(/\s+/g, " ");
}
type SearchablePatient = Pick<Patient, "reference"> & {
  identity: Pick<
    Patient["identity"],
    "firstName" | "lastName" | "gsm" | "landline"
  >;
};
export function searchPatients<T extends SearchablePatient>(
  patients: readonly T[],
  search: string,
): T[] {
  const query = normalizeSearch(search);
  if (!query) return [...patients];
  if (/^[+\d\s().-]+$/.test(query)) {
    const digits = query.replace(/\D/g, "");
    if (!digits) return [];
    return patients.filter(
      (patient) =>
        [patient.identity.gsm, patient.identity.landline].some((phone) =>
          phone.replace(/\D/g, "").includes(digits),
        ) || normalizeSearch(patient.reference).includes(query),
    );
  }
  const words = query.split(" ");
  return patients.filter((patient) => {
    const fields = [
      patient.identity.firstName,
      patient.identity.lastName,
      patient.reference,
      patient.identity.gsm,
      patient.identity.landline,
    ].map(normalizeSearch);
    return words.every((word) => fields.some((field) => field.includes(word)));
  });
}
export function filterAndSortPatients(
  patients: readonly Patient[],
  query: Pick<PatientDirectoryQuery, "search" | "status" | "sort">,
): Patient[] {
  const filtered = searchPatients(patients, query.search).filter(
    (patient) => query.status === "all" || patient.status === query.status,
  );
  const collator = new Intl.Collator("fr", {
    sensitivity: "base",
    numeric: true,
  });
  return filtered
    .map((patient, index) => ({ patient, index }))
    .sort((a, b) => {
      const order =
        query.sort === "name"
          ? collator.compare(
              `${a.patient.identity.lastName} ${a.patient.identity.firstName}`,
              `${b.patient.identity.lastName} ${b.patient.identity.firstName}`,
            )
          : a.patient.createdAt.localeCompare(b.patient.createdAt) *
            (query.sort === "newest" ? -1 : 1);
      return order || a.index - b.index;
    })
    .map((item) => item.patient);
}
export function paginatePatients(
  patients: readonly Patient[],
  requestedPage: number,
  requestedSize: number,
) {
  const pageSize = Number.isFinite(requestedSize)
    ? Math.max(1, Math.floor(requestedSize))
    : 10;
  const pageCount = Math.max(1, Math.ceil(patients.length / pageSize));
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.min(pageCount, Math.floor(requestedPage)))
    : 1;
  const start = (page - 1) * pageSize;
  return {
    items: patients.slice(start, start + pageSize),
    total: patients.length,
    page,
    pageCount,
    first: patients.length ? start + 1 : 0,
    last: Math.min(start + pageSize, patients.length),
  };
}
export function patientIndicators(
  patients: readonly Patient[],
  today: string,
  upcomingPatientIds?: ReadonlySet<string>,
) {
  return {
    total: patients.length,
    newThisMonth: patients.filter(
      (patient) =>
        clinicDate(new Date(patient.createdAt)).slice(0, 7) ===
          today.slice(0, 7) && clinicDate(new Date(patient.createdAt)) <= today,
    ).length,
    withUpcomingAppointments: patients.filter((patient) =>
      upcomingPatientIds
        ? upcomingPatientIds.has(patient.id)
        : patient.demoNextAppointmentDate &&
          patient.demoNextAppointmentDate >= today,
    ).length,
  };
}
