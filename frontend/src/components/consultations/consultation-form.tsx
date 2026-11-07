"use client";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { searchPatients } from "@/lib/patients/directory";
import { formatPatientDate } from "@/lib/patients/dates";
import { consultationSchema } from "@/lib/consultations/schema";
import {
  ClinicalRecordError,
  LinkedConsultationError,
} from "@/lib/consultations/repository";
import type {
  Consultation,
  ConsultationInput,
} from "@/lib/consultations/types";
import type { Patient } from "@/lib/patients/types";
import type { Appointment } from "@/lib/appointments/types";
import { useConsultations } from "./consultation-provider";
import { TreatmentFields } from "./treatment-fields";
const subscribe = () => () => {};
export function ConsultationForm({
  consultation,
  initial,
  patients,
  appointments,
  consultations,
}: {
  consultation?: Consultation;
  initial: ConsultationInput;
  patients: readonly Patient[];
  appointments: readonly Appointment[];
  consultations: readonly Consultation[];
}) {
  const router = useRouter();
  const clinical = useConsultations();
  const [search, setSearch] = useState("");
  const [saveError, setSaveError] = useState("");
  const [duplicateId, setDuplicateId] = useState("");
  const saving = useRef(false);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const form = useForm<ConsultationInput>({
    resolver: zodResolver(consultationSchema),
    defaultValues: initial,
  });
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = form;
  const patientId = useWatch({ control, name: "patientId" });
  const selectedPatient = patients.find((item) => item.id === patientId);
  const results = searchPatients(patients, search);
  const options =
    selectedPatient && !results.some((item) => item.id === patientId)
      ? [selectedPatient, ...results]
      : results;
  const linked = useWatch({ control, name: "appointmentId" });
  const available = appointments.filter(
    (item) =>
      item.patientId === patientId &&
      !consultations.some(
        (record) =>
          record.id !== consultation?.id && record.appointmentId === item.id,
      ),
  );
  const disabled = !hydrated || isSubmitting;
  const patientField = register("patientId", {
    onChange: () => setValue("appointmentId", "", { shouldValidate: true }),
  });
  async function save(input: ConsultationInput) {
    if (saving.current) return;
    saving.current = true;
    setSaveError("");
    setDuplicateId("");
    try {
      const record = consultation
        ? await clinical.update(consultation.id, input)
        : await clinical.create(input);
      router.push(`/consultations/${record.id}`);
    } catch (error) {
      if (error instanceof LinkedConsultationError)
        setDuplicateId(error.consultationId);
      if (error instanceof ClinicalRecordError && error.field) {
        setError(error.field, { message: error.message });
        setFocus(error.field);
      } else {
        setSaveError(
          error instanceof ClinicalRecordError
            ? error.message
            : error instanceof z.ZodError
              ? (error.issues[0]?.message ?? "Vérifiez les champs.")
              : "Impossible d’enregistrer la consultation. Réessayez.",
        );
      }
    } finally {
      saving.current = false;
    }
  }
  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit(save)(event);
      }}
      className="space-y-6"
      aria-busy={isSubmitting}
    >
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Contexte de la consultation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {!consultation && (
            <div className="space-y-2">
              <label
                htmlFor="consultation-patient-search"
                className="block text-sm font-semibold"
              >
                Rechercher un patient
              </label>
              <Input
                id="consultation-patient-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={disabled}
                placeholder="Nom ou référence patient"
              />
              {results.length === 0 && (
                <p role="status" className="text-sm text-muted-foreground">
                  Aucun patient ne correspond. La sélection courante est
                  conservée.
                </p>
              )}
            </div>
          )}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="consultation-patient"
                className="block text-sm font-semibold"
              >
                Patient (obligatoire)
              </label>
              <Select
                id="consultation-patient"
                required
                disabled={disabled}
                aria-invalid={Boolean(errors.patientId)}
                aria-describedby={
                  errors.patientId
                    ? "consultation-patient-error"
                    : "consultation-patient-help"
                }
                {...patientField}
              >
                {!consultation && (
                  <option value="">Sélectionner un patient</option>
                )}
                {(consultation && selectedPatient
                  ? [selectedPatient]
                  : options
                ).map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.identity.firstName} {patient.identity.lastName} ·{" "}
                    {patient.reference}
                  </option>
                ))}
              </Select>
              {errors.patientId && (
                <p
                  id="consultation-patient-error"
                  role="alert"
                  className="text-sm text-danger"
                >
                  {errors.patientId.message}
                </p>
              )}
              <p
                id="consultation-patient-help"
                className="text-xs leading-5 text-muted-foreground"
              >
                {consultation
                  ? "Le patient est conservé après la création."
                  : "Sélectionnez un dossier existant."}
              </p>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="consultation-date"
                className="block text-sm font-semibold"
              >
                Date de consultation (obligatoire)
              </label>
              <Input
                id="consultation-date"
                type="date"
                required
                disabled={disabled}
                aria-invalid={Boolean(errors.consultationDate)}
                aria-describedby={
                  errors.consultationDate
                    ? "consultation-date-error"
                    : undefined
                }
                {...register("consultationDate")}
              />
              {errors.consultationDate && (
                <p
                  id="consultation-date-error"
                  role="alert"
                  className="text-sm text-danger"
                >
                  {errors.consultationDate.message}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="consultation-appointment"
              className="block text-sm font-semibold"
            >
              Rendez-vous lié (facultatif)
            </label>
            <Select
              id="consultation-appointment"
              disabled={disabled || !patientId}
              aria-invalid={Boolean(errors.appointmentId)}
              aria-describedby={
                errors.appointmentId
                  ? "consultation-appointment-error"
                  : "consultation-appointment-help"
              }
              {...register("appointmentId")}
            >
              <option value="">Sans rendez-vous · Visite spontanée</option>
              {linked && !available.some((item) => item.id === linked) && (
                <option value={linked}>Lien de rendez-vous à vérifier</option>
              )}
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatPatientDate(item.date)} · {item.startTime} · {item.id}
                </option>
              ))}
            </Select>
            {errors.appointmentId && (
              <p
                role="alert"
                id="consultation-appointment-error"
                className="text-sm text-danger"
              >
                {errors.appointmentId.message}
              </p>
            )}
            <p
              id="consultation-appointment-help"
              className="text-xs leading-5 text-muted-foreground"
            >
              Seuls les rendez-vous de ce patient disponibles pour un lien sont
              proposés. Les statuts de l’agenda restent gérés séparément.
            </p>
          </div>
          {selectedPatient && (
            <Button asChild variant="outline">
              <Link href={`/patients/${selectedPatient.id}/clinique`}>
                Consulter le contexte médical du patient
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Compte rendu clinique</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Saisie du dentiste · Données fictives uniquement.
          </p>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {(
            [
              {
                name: "chiefComplaint",
                label: "Motif de consultation (obligatoire)",
                max: 500,
              },
              {
                name: "clinicalObservations",
                label: "Observations cliniques (facultatif)",
                max: 5000,
              },
              {
                name: "assessment",
                label: "Évaluation clinique (facultatif)",
                max: 5000,
              },
              {
                name: "treatmentPlan",
                label: "Plan de traitement (facultatif)",
                max: 5000,
              },
              {
                name: "notes",
                label: "Notes complémentaires (facultatif)",
                max: 5000,
              },
            ] as const
          ).map((field) => (
            <div key={field.name} className="space-y-2">
              <label
                htmlFor={`clinical-${field.name}`}
                className="block text-sm font-semibold"
              >
                {field.label}
              </label>
              <Textarea
                id={`clinical-${field.name}`}
                rows={field.name === "chiefComplaint" ? 3 : 5}
                maxLength={field.max}
                required={field.name === "chiefComplaint"}
                disabled={disabled}
                aria-invalid={Boolean(errors[field.name])}
                aria-describedby={
                  errors[field.name]
                    ? `clinical-${field.name}-error`
                    : undefined
                }
                {...register(field.name)}
              />
              {errors[field.name] && (
                <p
                  role="alert"
                  id={`clinical-${field.name}-error`}
                  className="text-sm text-danger"
                >
                  {errors[field.name]?.message}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <TreatmentFields form={form} disabled={disabled} />
      {saveError && (
        <p
          role="alert"
          className="rounded-lg border border-danger p-4 text-sm text-danger"
        >
          {saveError}
        </p>
      )}
      {duplicateId && (
        <Link
          className="inline-block text-sm font-semibold text-primary underline"
          href={`/consultations/${duplicateId}`}
        >
          Ouvrir la consultation existante
        </Link>
      )}
      <div className="flex flex-wrap justify-between gap-3">
        <Button asChild variant="outline">
          <Link
            href={
              consultation
                ? `/consultations/${consultation.id}`
                : "/consultations"
            }
          >
            Annuler la saisie
          </Link>
        </Button>
        <Button type="submit" disabled={disabled}>
          {isSubmitting
            ? "Enregistrement en mémoire…"
            : consultation
              ? "Enregistrer le brouillon"
              : "Créer le brouillon"}
        </Button>
      </div>
    </form>
  );
}
