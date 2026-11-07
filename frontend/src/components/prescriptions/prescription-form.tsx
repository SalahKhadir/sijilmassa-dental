"use client";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { searchPatients } from "@/lib/patients/directory";
import { clinicDate, formatPatientDate } from "@/lib/patients/dates";
import { prescriptionSchema } from "@/lib/prescriptions/schema";
import { PrescriptionError } from "@/lib/prescriptions/repository";
import type {
  Prescription,
  PrescriptionInput,
  PrescriptionPatient,
  PrescriptionConsultation,
} from "@/lib/prescriptions/types";
import { usePrescriptions } from "./prescription-provider";
import { MedicationFields } from "./medication-fields";
const subscribe = () => () => {};
export function PrescriptionForm({
  prescription,
  initial,
  patients,
  consultations,
}: {
  prescription?: Prescription;
  initial: PrescriptionInput;
  patients: readonly PrescriptionPatient[];
  consultations: readonly PrescriptionConsultation[];
}) {
  const { create, updateDraft } = usePrescriptions();
  const router = useRouter();
  const saving = useRef(false);
  const [search, setSearch] = useState("");
  const [error, setSaveError] = useState("");
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const form = useForm<PrescriptionInput>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: initial,
  });
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setFocus,
    setError,
    formState: { errors, isSubmitting },
  } = form;
  const patientId = useWatch({ control, name: "patientId" });
  const issuedDate = useWatch({ control, name: "issuedDate" });
  const selected = patients.find((patient) => patient.id === patientId);
  const found = searchPatients(patients, search);
  const options =
    selected && !found.some((patient) => patient.id === selected.id)
      ? [selected, ...found]
      : found;
  const available = consultations.filter(
    (record) => record.patientId === patientId,
  );
  const disabled = !hydrated || isSubmitting;
  async function save(input: PrescriptionInput) {
    if (saving.current) return;
    saving.current = true;
    setSaveError("");
    try {
      const record = prescription
        ? await updateDraft(prescription.id, input)
        : await create(input);
      router.push(`/documents/ordonnances/${record.id}`);
    } catch (error) {
      if (error instanceof PrescriptionError && error.field) {
        setError(error.field, { message: error.message });
        setFocus(error.field);
      } else
        setSaveError(
          error instanceof PrescriptionError
            ? error.message
            : error instanceof z.ZodError
              ? (error.issues[0]?.message ?? "Vérifiez les champs.")
              : "Impossible d’enregistrer le brouillon. Réessayez.",
        );
    } finally {
      saving.current = false;
    }
  }
  return (
    <form
      noValidate
      className="space-y-6"
      aria-busy={isSubmitting}
      onSubmit={(event) => {
        void handleSubmit(save)(event);
      }}
    >
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Patient et date</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {!prescription && (
            <div className="space-y-2">
              <label
                htmlFor="rx-patient-search"
                className="block text-sm font-semibold"
              >
                Rechercher un patient
              </label>
              <Input
                id="rx-patient-search"
                placeholder="Nom, référence ou téléphone"
                value={search}
                disabled={disabled}
                onChange={(event) => setSearch(event.target.value)}
              />
              {!found.length && (
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
                htmlFor="rx-patient"
                className="block text-sm font-semibold"
              >
                Patient (obligatoire)
              </label>
              <Select
                id="rx-patient"
                required
                disabled={disabled}
                aria-invalid={Boolean(errors.patientId)}
                aria-describedby={
                  errors.patientId ? "rx-patient-error" : undefined
                }
                {...register("patientId", {
                  onChange: () =>
                    setValue("consultationId", "", { shouldValidate: true }),
                })}
              >
                {!prescription && (
                  <option value="">Sélectionner un patient</option>
                )}
                {(prescription && selected ? [selected] : options).map(
                  (patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name} · {patient.reference}
                    </option>
                  ),
                )}
              </Select>
              {errors.patientId && (
                <p
                  role="alert"
                  id="rx-patient-error"
                  className="text-sm text-danger"
                >
                  {errors.patientId.message}
                </p>
              )}
              {prescription && (
                <p className="text-xs text-muted-foreground">
                  Le patient est conservé après la création.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="rx-date" className="block text-sm font-semibold">
                Date de l’ordonnance (obligatoire)
              </label>
              <Input
                id="rx-date"
                type="date"
                required
                disabled={disabled}
                aria-invalid={Boolean(errors.issuedDate)}
                aria-describedby={
                  errors.issuedDate ? "rx-date-error" : "rx-date-help"
                }
                {...register("issuedDate")}
              />
              {errors.issuedDate && (
                <p
                  role="alert"
                  id="rx-date-error"
                  className="text-sm text-danger"
                >
                  {errors.issuedDate.message}
                </p>
              )}
              <p
                id="rx-date-help"
                className="text-xs leading-5 text-muted-foreground"
              >
                {issuedDate && issuedDate < clinicDate()
                  ? "La date choisie est antérieure à aujourd’hui. Vérifiez-la avant de finaliser."
                  : "Vérifiez la date d’émission avant de finaliser."}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="rx-consultation"
              className="block text-sm font-semibold"
            >
              Consultation liée (facultatif)
            </label>
            <Select
              id="rx-consultation"
              disabled={disabled || !patientId}
              aria-invalid={Boolean(errors.consultationId)}
              aria-describedby={
                errors.consultationId ? "rx-consultation-error" : undefined
              }
              {...register("consultationId")}
            >
              <option value="">Sans consultation liée</option>
              {available.map((record) => (
                <option key={record.id} value={record.id}>
                  {formatPatientDate(record.consultationDate)} · {record.id}
                </option>
              ))}
            </Select>
            {errors.consultationId && (
              <p
                id="rx-consultation-error"
                role="alert"
                className="text-sm text-danger"
              >
                {errors.consultationId.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <MedicationFields form={form} disabled={disabled} />
      <Card>
        <CardHeader>
          <CardTitle>Instructions générales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label
            htmlFor="rx-instructions"
            className="block text-sm font-semibold"
          >
            Instructions générales (facultatif)
          </label>
          <Textarea
            id="rx-instructions"
            rows={4}
            maxLength={2000}
            disabled={disabled}
            aria-invalid={Boolean(errors.generalInstructions)}
            aria-describedby={
              errors.generalInstructions ? "rx-instructions-error" : undefined
            }
            {...register("generalInstructions")}
          />
          {errors.generalInstructions && (
            <p
              id="rx-instructions-error"
              role="alert"
              className="text-sm text-danger"
            >
              {errors.generalInstructions.message}
            </p>
          )}
        </CardContent>
      </Card>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger p-4 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-3">
        <Button asChild variant="outline">
          <Link
            href={
              prescription
                ? `/documents/ordonnances/${prescription.id}`
                : "/documents"
            }
          >
            Annuler la saisie
          </Link>
        </Button>
        <Button type="submit" disabled={disabled}>
          {isSubmitting ? "Enregistrement…" : "Enregistrer le brouillon"}
        </Button>
      </div>
    </form>
  );
}
