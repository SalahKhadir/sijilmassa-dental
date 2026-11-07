import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatPatientDate } from "@/lib/patients/dates";
import { formatMAD } from "@/lib/format";
import type { PatientTreatmentEntry } from "@/lib/patients/types";

export function TreatmentTable({
  entries,
}: {
  entries: readonly PatientTreatmentEntry[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historique des traitements et paiements</CardTitle>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Prototype en lecture seule · Exemples entièrement fictifs · Montants
          en MAD (DH). Le reste correspond ici uniquement à Prix − Reçu.
        </p>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Aucun traitement fictif dans ce dossier.
          </p>
        ) : (
          <div
            className="overflow-x-auto rounded-lg border"
            tabIndex={0}
            role="region"
            aria-label="Historique fictif des traitements et paiements"
          >
            <table className="w-full min-w-[600px] text-left text-sm">
              <caption className="sr-only">
                Exemples fictifs de traitements et paiements, en dirhams
                marocains
              </caption>
              <thead className="border-b bg-muted text-xs text-muted-foreground">
                <tr>
                  {["Date", "Traitement", "Prix", "Reçu", "Reste"].map(
                    (label) => (
                      <th key={label} scope="col" className="px-4 py-3">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {formatPatientDate(entry.date)}
                    </td>
                    <th scope="row" className="px-4 py-4 font-medium">
                      {entry.treatment}
                    </th>
                    <td className="px-4 py-4 whitespace-nowrap tabular-nums">
                      {formatMAD(entry.priceCentimes)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap tabular-nums">
                      {formatMAD(entry.receivedCentimes)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap tabular-nums">
                      {formatMAD(entry.priceCentimes - entry.receivedCentimes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
