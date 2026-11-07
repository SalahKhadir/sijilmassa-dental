import type { PatientIdentity } from "@/lib/patients/types";
import { maskCIN } from "@/lib/patients/privacy";
import { formatPatientDate } from "@/lib/patients/dates";

export function PatientIdentitySummary({
  identity,
}: {
  identity: PatientIdentity;
}) {
  const fields = [
    ["Nom et prénom", `${identity.lastName} ${identity.firstName}`],
    ["Sexe", identity.sex === "unanswered" ? "Non renseigné" : identity.sex],
    ["Date de naissance", formatPatientDate(identity.dateOfBirth)],
    ["Adresse", identity.address || "Non renseignée"],
    ["GSM", identity.gsm || "Non renseigné"],
    ["Téléphone fixe", identity.landline || "Non renseigné"],
    ["Profession", identity.profession || "Non renseignée"],
    ["CIN N°", maskCIN(identity.cin)],
    ["Couverture médicale", identity.medicalCoverage || "Non renseignée"],
  ];
  return (
    <dl className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
          <dd className="mt-2 text-sm leading-6 font-medium break-words whitespace-pre-wrap">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
