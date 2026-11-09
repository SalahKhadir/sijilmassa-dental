import Link from "next/link";
import { Eye, Pencil } from "lucide-react";
import type { PatientDirectoryEntry as Patient } from "@/lib/patients/privacy";
import { formatPatientDate } from "@/lib/patients/dates";
import { Button } from "@/components/ui/button";
import { PatientStatus } from "./patient-status";

function PatientActions({ patient }: { patient: Patient }) {
  const name = `${patient.identity.firstName} ${patient.identity.lastName}`;
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" asChild className="px-2">
        <Link href={`/demo/patients/${patient.id}`} aria-label={`Voir ${name}`}>
          <Eye aria-hidden="true" />
          <span className="xl:sr-only">Voir</span>
        </Link>
      </Button>
      <Button variant="ghost" asChild className="px-2">
        <Link
          href={`/demo/patients/${patient.id}/modifier`}
          aria-label={`Modifier ${name}`}
        >
          <Pencil aria-hidden="true" />
          <span className="xl:sr-only">Modifier</span>
        </Link>
      </Button>
    </div>
  );
}
export function PatientTable({ patients }: { patients: readonly Patient[] }) {
  return (
    <>
      <div className="hidden xl:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Annuaire administratif des patients fictifs
          </caption>
          <thead className="border-y bg-muted text-xs text-muted-foreground">
            <tr>
              {[
                "Référence",
                "Nom et prénom",
                "Sexe",
                "GSM",
                "Naissance",
                "Inscription",
                "Statut",
                "Actions",
              ].map((label) => (
                <th key={label} scope="col" className="px-4 py-4 font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {patients.map((patient) => (
              <tr key={patient.id} className="hover:bg-muted/70">
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {patient.reference}
                </td>
                <th scope="row" className="px-4 py-3 font-semibold">
                  <Link
                    href={`/demo/patients/${patient.id}`}
                    className="rounded-sm text-primary hover:underline"
                  >
                    {patient.identity.firstName} {patient.identity.lastName}
                  </Link>
                </th>
                <td className="px-4 py-3">
                  {patient.identity.sex === "unanswered"
                    ? "Non renseigné"
                    : patient.identity.sex}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {patient.identity.gsm || "Non renseigné"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatPatientDate(patient.identity.dateOfBirth)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatPatientDate(patient.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <PatientStatus status={patient.status} />
                </td>
                <td className="px-3 py-3">
                  <PatientActions patient={patient} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y xl:hidden" aria-label="Liste des patients">
        {patients.map((patient) => (
          <li key={patient.id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  {patient.reference}
                </p>
                <Link
                  href={`/demo/patients/${patient.id}`}
                  className="rounded-sm text-sm font-semibold text-primary hover:underline"
                >
                  {patient.identity.firstName} {patient.identity.lastName}
                </Link>
              </div>
              <PatientStatus status={patient.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              Sexe ·{" "}
              {patient.identity.sex === "unanswered"
                ? "Non renseigné"
                : patient.identity.sex}
            </p>
            <dl className="grid gap-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">GSM</dt>
                <dd className="mt-1 font-medium">
                  {patient.identity.gsm || "Non renseigné"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Naissance</dt>
                <dd className="mt-1">
                  {formatPatientDate(patient.identity.dateOfBirth)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Inscription</dt>
                <dd className="mt-1">{formatPatientDate(patient.createdAt)}</dd>
              </div>
            </dl>
            <PatientActions patient={patient} />
          </li>
        ))}
      </ul>
    </>
  );
}
