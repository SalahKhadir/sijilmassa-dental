import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatPatientDate } from "@/lib/patients/dates";
import { chronologicalTreatments } from "@/lib/consultations/selectors";
import type { Consultation } from "@/lib/consultations/types";
export function TreatmentHistory({
  consultation,
}: {
  consultation: Consultation;
}) {
  const entries = chronologicalTreatments(consultation);
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Soins enregistrés</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {entries.length ? (
          <ol className="divide-y">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="space-y-3 py-5 first:pt-0 last:pb-0"
              >
                <p className="text-sm font-semibold">
                  {formatPatientDate(entry.treatmentDate)}
                  {entry.toothReference &&
                    ` · Référence dentaire ${entry.toothReference}`}
                </p>
                <p className="text-sm leading-6 break-words whitespace-pre-wrap">
                  {entry.description}
                </p>
                {entry.notes && (
                  <p className="text-sm leading-6 break-words whitespace-pre-wrap text-muted-foreground">
                    {entry.notes}
                  </p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            Aucun soin enregistré pour cette consultation.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
