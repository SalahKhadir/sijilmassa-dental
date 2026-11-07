import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatPatientDate } from "@/lib/patients/dates";
import type { Consultation } from "@/lib/consultations/types";
import {
  chronologicalTreatments,
  type ClinicalPatient,
} from "@/lib/consultations/selectors";
import { ConsultationStatus } from "./consultation-status";
export function ConsultationList({
  records,
  patients,
  clinicalHistory = false,
}: {
  records: readonly Consultation[];
  patients: readonly ClinicalPatient[];
  clinicalHistory?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>
          {clinicalHistory
            ? "Historique des consultations"
            : "Consultations récentes"}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {records.length ? (
          <ul className="divide-y">
            {records.map((record) => {
              const patient = patients.find(
                (item) => item.id === record.patientId,
              );
              return (
                <li
                  key={record.id}
                  className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <Link
                      href={`/consultations/${record.id}`}
                      className="inline-block rounded-sm text-base font-semibold text-primary hover:underline"
                    >
                      {patient
                        ? `${patient.identity.firstName} ${patient.identity.lastName}`
                        : "Patient introuvable"}
                      <span className="sr-only">
                        {" "}
                        · Consultation du{" "}
                        {formatPatientDate(record.consultationDate)} ·{" "}
                        {record.id}
                      </span>
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {patient?.reference} ·{" "}
                      {formatPatientDate(record.consultationDate)} ·{" "}
                      {record.treatments.length} soin
                      {record.treatments.length === 1 ? "" : "s"} enregistré
                      {record.treatments.length === 1 ? "" : "s"}
                    </p>
                    {clinicalHistory && (
                      <p className="text-sm leading-6 break-words whitespace-pre-wrap">
                        {record.chiefComplaint}
                      </p>
                    )}
                    {clinicalHistory && record.treatments.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer rounded-sm py-2 font-semibold text-primary">
                          Consulter les soins enregistrés
                        </summary>
                        <ol className="space-y-3 border-l pl-4">
                          {chronologicalTreatments(record).map((entry) => (
                            <li key={entry.id}>
                              <p className="text-xs text-muted-foreground">
                                {formatPatientDate(entry.treatmentDate)}
                                {entry.toothReference &&
                                  ` · Référence dentaire ${entry.toothReference}`}
                              </p>
                              <p className="mt-1 leading-6 break-words whitespace-pre-wrap">
                                {entry.description}
                              </p>
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </div>
                  <ConsultationStatus status={record.status} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">
            Aucune consultation à afficher. Créez une consultation ou ajustez
            les filtres.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
