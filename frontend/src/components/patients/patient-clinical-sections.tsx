import { Check, Minus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  allergyOptions,
  medicalHistoryOptions,
  type Patient,
  type PatientTreatmentEntry,
  type ReportStatus,
  type YesNoAnswer,
} from "@/lib/patients/types";
import { TreatmentTable } from "./treatment-table";

export function answerLabel(value: YesNoAnswer) {
  return value === "yes" ? "Oui" : value === "no" ? "Non" : "Non renseigné";
}
function ReportedCategories({
  options,
  selected,
  status,
  factualAnswers = false,
}: {
  options: readonly string[];
  selected: readonly string[];
  status: ReportStatus;
  factualAnswers?: boolean;
}) {
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        {status === "unanswered"
          ? "Non renseigné"
          : selected.length
            ? "Catégories rapportées"
            : "Renseigné · Aucune catégorie cochée"}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {options.map((option) => {
          const checked = selected.includes(option);
          const Icon = checked ? Check : Minus;
          return (
            <li key={option} className="flex items-center gap-2 text-sm">
              <Icon
                aria-hidden="true"
                className={
                  checked
                    ? "size-4 text-primary"
                    : "size-4 text-muted-foreground"
                }
              />
              <span>
                {option}
                {factualAnswers && (
                  <span className="ml-2 font-medium">
                    ·{" "}
                    {status === "unanswered"
                      ? "Non renseigné"
                      : checked
                        ? "Oui"
                        : "Non"}
                  </span>
                )}
                {!factualAnswers && (
                  <span className="sr-only">
                    {" "}
                    · {checked ? "Déclaré" : "Non coché"}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
export function PatientClinicalSections({
  patient,
  treatments,
  factualAnswers = false,
}: {
  patient: Pick<
    Patient,
    "medicalHistory" | "allergies" | "healthQuestionnaire"
  >;
  treatments?: readonly PatientTreatmentEntry[];
  factualAnswers?: boolean;
}) {
  return (
    <>
      <p className="rounded-lg border border-primary/20 bg-primary-tint p-4 text-sm leading-6 text-primary">
        Dossier de santé · Prototype destiné au dentiste. Les catégories
        affichées sont des déclarations fictives. Les autorisations seront
        contrôlées par le futur backend.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Antécédents médicaux</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Avez-vous ou avez-vous déjà eu un des problèmes suivants ?
          </p>
        </CardHeader>
        <CardContent>
          <ReportedCategories
            options={medicalHistoryOptions}
            selected={patient.medicalHistory.conditions}
            status={patient.medicalHistory.reportStatus}
            factualAnswers={factualAnswers}
          />
          {patient.medicalHistory.otherDetails && (
            <p className="mt-5 text-sm leading-6 break-words whitespace-pre-wrap">
              Autres · {patient.medicalHistory.otherDetails}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Allergies</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Avez-vous une allergie contre une de ces substances ? Catégories
            rapportées, à confirmer par le dentiste.
          </p>
        </CardHeader>
        <CardContent>
          {patient.allergies.reportStatus === "reported" &&
            patient.allergies.categories.length > 0 && (
              <p className="mb-4 rounded-lg border border-primary/20 bg-primary-tint p-3 text-sm font-semibold text-primary">
                Allergies rapportées · {patient.allergies.categories.join(", ")}
              </p>
            )}
          <ReportedCategories
            options={allergyOptions}
            selected={patient.allergies.categories}
            status={patient.allergies.reportStatus}
            factualAnswers={factualAnswers}
          />
          {patient.allergies.clarification && (
            <p className="mt-5 text-sm leading-6 break-words whitespace-pre-wrap">
              Précisions · {patient.allergies.clarification}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Questionnaire de santé</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2">
            {[
              [
                "Êtes-vous sous traitement médical ?",
                answerLabel(patient.healthQuestionnaire.underMedicalTreatment),
              ],
              [
                "Êtes-vous enceinte ?",
                answerLabel(patient.healthQuestionnaire.pregnant),
              ],
              [
                "Avez-vous quelque chose à ajouter sur votre santé ?",
                patient.healthQuestionnaire.additionalInformation ||
                  "Non renseigné",
              ],
              [
                "Motif de consultation",
                patient.healthQuestionnaire.reasonForConsultation ||
                  "Non renseigné",
              ],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs leading-5 text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-2 text-sm leading-6 break-words whitespace-pre-wrap">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      {treatments && <TreatmentTable entries={treatments} />}
    </>
  );
}
