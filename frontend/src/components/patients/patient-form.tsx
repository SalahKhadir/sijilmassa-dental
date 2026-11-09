"use client";

import Link from "next/link";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  FormProvider,
  useForm,
  type FieldPath,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Save, ArrowLeft, ArrowRight } from "lucide-react";
import type { Patient, CreatePatientInput } from "@/lib/patients/types";
import { patientSchema, emptyPatientInput } from "@/lib/patients/schema";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { usePatients } from "./patient-provider";
import {
  PatientIdentityFields,
  MedicalHistoryFields,
  AllergiesAndHealthFields,
} from "./patient-form-fields";
import { PatientIdentitySummary } from "./patient-identity-summary";
import { PatientClinicalSections } from "./patient-clinical-sections";

const subscribeToHydration = () => () => {};
export function PatientForm({
  patient,
  clinical = true,
}: {
  patient?: Patient;
  clinical?: boolean;
}) {
  const administrativeOnly = Boolean(patient) && !clinical;
  const steps = administrativeOnly
    ? ["Informations personnelles", "Vérification et confirmation"]
    : [
        "Informations personnelles",
        "Antécédents médicaux",
        "Allergies et questionnaire de santé",
        "Vérification et confirmation",
      ];
  const { today, createPatient, updatePatient } = usePatients();
  const schema = useMemo(() => patientSchema(today), [today]);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [step, setStep] = useState(0);
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useLayoutEffect(() => {
    if (previousStep.current !== step) stepHeading.current?.focus();
    previousStep.current = step;
  }, [step]);
  const router = useRouter();
  const form = useForm<CreatePatientInput>({
    resolver: zodResolver(schema),
    defaultValues: patient ?? emptyPatientInput(),
    shouldFocusError: false,
  });
  const {
    handleSubmit,
    trigger,
    getValues,
    setFocus,
    formState: { isSubmitting },
  } = form;
  const disabled = !hydrated || isSubmitting;
  const returnUrl = patient
    ? `/demo/patients/${patient.id}${clinical ? "/dossier" : ""}`
    : "/demo/patients";
  const isReview = step === steps.length - 1;
  const review = isReview ? getValues() : null;
  function focusStep(next: number) {
    setStep(next);
  }
  async function nextStep() {
    const fields: FieldPath<CreatePatientInput>[] =
      step === 0
        ? [
            "identity.lastName",
            "identity.firstName",
            "identity.sex",
            "identity.dateOfBirth",
            "identity.address",
            "identity.gsm",
            "identity.landline",
            "identity.profession",
            "identity.cin",
            "identity.medicalCoverage",
            "status",
          ]
        : step === 1
          ? [
              "medicalHistory.reportStatus",
              "medicalHistory.conditions",
              "medicalHistory.otherDetails",
            ]
          : [
              "allergies.reportStatus",
              "allergies.categories",
              "allergies.clarification",
              "healthQuestionnaire.underMedicalTreatment",
              "healthQuestionnaire.pregnant",
              "healthQuestionnaire.additionalInformation",
              "healthQuestionnaire.reasonForConsultation",
            ];
    if (await trigger(fields, { shouldFocus: true })) focusStep(step + 1);
  }
  function invalid(errors: FieldErrors<CreatePatientInput>) {
    const next =
      errors.identity || errors.status ? 0 : errors.medicalHistory ? 1 : 2;
    setStep(administrativeOnly ? 0 : next);
    const name = errors.identity
      ? `identity.${Object.keys(errors.identity)[0]}`
      : errors.medicalHistory
        ? `medicalHistory.${Object.keys(errors.medicalHistory)[0]}`
        : errors.allergies
          ? `allergies.${Object.keys(errors.allergies)[0]}`
          : "status";
    requestAnimationFrame(() =>
      setFocus(name as FieldPath<CreatePatientInput>),
    );
  }
  async function submit(values: CreatePatientInput) {
    // Enter on an early step advances validation instead of creating a record.
    if (!isReview) {
      await nextStep();
      return;
    }
    if (saving.current) return;
    saving.current = true;
    setSaveError("");
    try {
      const saved = patient
        ? await updatePatient(
            patient.id,
            administrativeOnly
              ? { identity: values.identity, status: values.status }
              : values,
          )
        : await createPatient(values);
      router.push(`/demo/patients/${saved.id}${clinical ? "/dossier" : ""}`);
    } catch {
      setSaveError(
        "Impossible d’enregistrer le dossier en mémoire. Vérifiez les champs et réessayez.",
      );
    } finally {
      saving.current = false;
    }
  }
  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={(event) => {
          if (!isReview) {
            event.preventDefault();
            void nextStep();
          } else void handleSubmit(submit, invalid)(event);
        }}
        aria-busy={isSubmitting}
        className="space-y-6"
      >
        <noscript>
          <p>
            Activez JavaScript pour utiliser le formulaire de démonstration.
          </p>
        </noscript>
        <ol
          aria-label="Étapes du dossier patient"
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          {steps.map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={
                step === index
                  ? "rounded-lg border border-primary bg-primary-tint px-4 py-3 text-xs font-semibold text-primary"
                  : "rounded-lg border bg-surface px-4 py-3 text-xs text-muted-foreground"
              }
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>
        <Card>
          <CardHeader className="border-b">
            <h2
              ref={stepHeading}
              tabIndex={-1}
              className="text-base font-semibold outline-none"
            >
              {steps[step]}
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {administrativeOnly
                ? "Mise à jour des informations personnelles. Les données du questionnaire restent dans le dossier dentiste."
                : "Dossier de démonstration destiné au dentiste. Seuls Nom et Prénom sont obligatoires ; les questions de santé peuvent rester non renseignées."}
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            {step === 0 && (
              <PatientIdentityFields disabled={disabled} today={today} />
            )}
            {!administrativeOnly && step === 1 && (
              <MedicalHistoryFields disabled={disabled} />
            )}
            {!administrativeOnly && step === 2 && (
              <AllergiesAndHealthFields disabled={disabled} />
            )}
            {review && (
              <div className="space-y-6">
                <PatientIdentitySummary identity={review.identity} />
                <p className="text-sm">
                  Statut administratif ·{" "}
                  {review.status === "active" ? "Actif" : "Inactif"}
                </p>
                {!administrativeOnly && (
                  <PatientClinicalSections patient={review} />
                )}
                <p className="rounded-lg border border-secondary/30 bg-secondary-tint p-4 text-sm leading-6">
                  La confirmation conserve ce dossier fictif dans la mémoire de
                  cet onglet. Les changements seront réinitialisés au
                  rechargement.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        {saveError && (
          <p
            role="alert"
            className="rounded-lg border border-danger p-4 text-sm text-danger"
          >
            {saveError}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-3">
          <Button asChild variant="ghost">
            <Link href={returnUrl}>Annuler</Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => focusStep(step - 1)}
              >
                <ArrowLeft aria-hidden="true" />
                Précédent
              </Button>
            )}
            {isReview ? (
              <Button key="confirm" type="submit" disabled={disabled}>
                <Save aria-hidden="true" />
                {isSubmitting
                  ? "Enregistrement en mémoire…"
                  : patient
                    ? "Enregistrer en mémoire"
                    : "Créer le dossier fictif"}
              </Button>
            ) : (
              <Button key="continue" type="submit" disabled={disabled}>
                Continuer
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
