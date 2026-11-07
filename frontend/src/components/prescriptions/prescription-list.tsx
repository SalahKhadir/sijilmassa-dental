import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPatientDate } from "@/lib/patients/dates";
import type {
  Prescription,
  PrescriptionPatient,
} from "@/lib/prescriptions/types";
import { PrescriptionStatus } from "./prescription-status";
/** History metadata only. Medication content is confined to the document detail/editor. */
export function PrescriptionList({
  records,
  patients,
}: {
  records: readonly Prescription[];
  patients: readonly PrescriptionPatient[];
}) {
  if (!records.length)
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Aucune ordonnance à afficher. Créez une ordonnance ou ajustez les
        filtres.
      </p>
    );
  return (
    <ul className="divide-y">
      {records.map((record) => {
        const patient = patients.find(
          (person) => person.id === record.patientId,
        );
        return (
          <li
            key={record.id}
            className="flex flex-col justify-between gap-4 py-5 first:pt-0 last:pb-0 lg:flex-row"
          >
            <div className="min-w-0 space-y-2">
              <Link
                href={`/documents/ordonnances/${record.id}`}
                className="rounded-sm text-base font-semibold text-primary hover:underline"
              >
                Ordonnance du {formatPatientDate(record.issuedDate)}
                <span className="sr-only"> · {record.id}</span>
              </Link>
              <p className="text-sm text-muted-foreground">
                {patient?.name ?? "Patient introuvable"} · {patient?.reference}
              </p>
              {record.consultationId && (
                <Link
                  href={`/consultations/${record.consultationId}`}
                  className="inline-block text-xs text-primary underline"
                >
                  Voir la consultation liée
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <PrescriptionStatus status={record.status} />
              <Button asChild variant="outline">
                <Link href={`/documents/ordonnances/${record.id}#pdf`}>
                  Aperçu et téléchargement
                  <span className="sr-only"> · {record.id}</span>
                </Link>
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
