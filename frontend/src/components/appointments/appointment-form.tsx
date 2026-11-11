"use client";
import Link from "next/link";
import { PermissionGate } from "@/components/auth/session-boundary";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { searchPatients } from "@/lib/patients/directory";
import { appointmentSchema } from "@/lib/appointments/schema";
import {
  appointmentTypes,
  appointmentTypeValues,
  type Appointment,
  type AppointmentInput,
  type AppointmentPatient,
} from "@/lib/appointments/types";
import { developmentSchedule } from "@/lib/appointments/schedule";
import {
  AppointmentConflictError,
  AppointmentPatientError,
} from "@/lib/appointments/repository";
import { useAppointments } from "./appointment-provider";
const subscribe = () => () => {};
export function AppointmentForm({
  appointment,
  patients,
  initialDate,
  patientId = "",
}: {
  appointment?: Appointment;
  patients: readonly AppointmentPatient[];
  initialDate: string;
  patientId?: string;
}) {
  const { createAppointment, updateAppointment } = useAppointments();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const schema = useMemo(() => appointmentSchema(), []);
  const {
    register,
    handleSubmit,
    control,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentInput>({
    resolver: zodResolver(schema),
    defaultValues: appointment ?? {
      patientId,
      date: initialDate,
      startTime: "09:00",
      durationMinutes: developmentSchedule.defaultDuration,
      type: "CONSULTATION",
      reason: "",
      notes: "",
    },
  });
  const selectedId = useWatch({ control, name: "patientId" });
  const selected = patients.find((patient) => patient.id === selectedId);
  const filtered = searchPatients(patients, search);
  const options =
    selected && !filtered.some((patient) => patient.id === selected.id)
      ? [selected, ...filtered]
      : filtered;
  const disabled = !hydrated || isSubmitting;
  async function submit(input: AppointmentInput) {
    if (saving.current) return;
    if (!patients.some((patient) => patient.id === input.patientId)) {
      setError("patientId", {
        message:
          "Ce patient est introuvable. Sélectionnez un patient existant.",
      });
      setFocus("patientId");
      return;
    }
    saving.current = true;
    setSaveError("");
    try {
      const saved = appointment
        ? await updateAppointment(appointment.id, input)
        : await createAppointment(input);
      router.push(`/demo/rendez-vous/${saved.id}`);
    } catch (error) {
      if (error instanceof AppointmentConflictError) {
        setError("startTime", { message: error.message });
        setFocus("startTime");
      } else if (error instanceof AppointmentPatientError) {
        setError("patientId", { message: error.message });
        setFocus("patientId");
      } else
        setSaveError(
          error instanceof z.ZodError
            ? (error.issues[0]?.message ?? "Vérifiez les champs.")
            : "Impossible d’enregistrer le rendez-vous en mémoire. Réessayez.",
        );
    } finally {
      saving.current = false;
    }
  }
  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
      aria-busy={isSubmitting}
      className="space-y-6"
    >
      <noscript>
        <p>Activez JavaScript pour utiliser ce formulaire de démonstration.</p>
      </noscript>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Patient et créneau</CardTitle>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Les champs Patient, Date, Heure, Durée et Catégorie sont
            obligatoires.
          </p>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <label
              htmlFor="appointment-patient-search"
              className="block text-sm font-semibold"
            >
              Rechercher un patient
            </label>
            <Input
              id="appointment-patient-search"
              type="search"
              value={search}
              disabled={disabled}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, référence, GSM ou téléphone fixe…"
            />
            <p role="status" className="text-xs text-muted-foreground">
              {filtered.length
                ? `${filtered.length} patient(s) trouvé(s)`
                : "Aucun patient ne correspond à cette recherche."}
            </p>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="appointment-patient"
              className="block text-sm font-semibold"
            >
              Patient (obligatoire)
            </label>
            <Select
              id="appointment-patient"
              required
              disabled={disabled}
              aria-invalid={
                Boolean(errors.patientId) || Boolean(selectedId && !selected)
              }
              aria-describedby="appointment-patient-help appointment-patient-error"
              {...register("patientId")}
            >
              <option value="">Sélectionner un patient</option>
              {selectedId && !selected && (
                <option value={selectedId} disabled>
                  Patient introuvable
                </option>
              )}
              {options.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} · {patient.reference}
                </option>
              ))}
            </Select>
            <p
              id="appointment-patient-help"
              className="text-xs leading-5 text-muted-foreground"
            >
              La recherche filtre les choix et conserve la sélection courante.{" "}
              <PermissionGate permission="clinical">
              <Link
                href="/demo/patients"
                className="rounded-sm font-semibold text-primary underline"
              >
                Ouvrir l’annuaire patients
              </Link>
              </PermissionGate>
            </p>
            <p
              id="appointment-patient-error"
              role={
                errors.patientId || (selectedId && !selected)
                  ? "alert"
                  : undefined
              }
              className="text-sm text-danger"
            >
              {errors.patientId?.message ||
                (selectedId && !selected
                  ? "Le patient présélectionné est introuvable. Choisissez un patient de la liste."
                  : "")}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              { name: "date", label: "Date (obligatoire)", type: "date" },
              {
                name: "startTime",
                label: "Heure de début (obligatoire)",
                type: "time",
              },
              {
                name: "durationMinutes",
                label: "Durée en minutes (obligatoire)",
                type: "number",
              },
            ].map((field) => {
              const name = field.name as
                | "date"
                | "startTime"
                | "durationMinutes";
              return (
                <div key={name} className="space-y-2">
                  <label
                    htmlFor={`appointment-${name}`}
                    className="block text-sm font-semibold"
                  >
                    {field.label}
                  </label>
                  <Input
                    id={`appointment-${name}`}
                    type={field.type}
                    required
                    disabled={disabled}
                    min={
                      name === "durationMinutes"
                        ? developmentSchedule.minimumDuration
                        : undefined
                    }
                    max={
                      name === "durationMinutes"
                        ? developmentSchedule.maximumDuration
                        : undefined
                    }
                    step={name === "durationMinutes" ? 1 : undefined}
                    aria-invalid={Boolean(errors[name])}
                    aria-describedby={
                      errors[name] ? `appointment-${name}-error` : undefined
                    }
                    {...register(
                      name,
                      name === "durationMinutes" ? { valueAsNumber: true } : {},
                    )}
                  />
                  {errors[name] && (
                    <p
                      id={`appointment-${name}-error`}
                      role="alert"
                      className="text-sm text-danger"
                    >
                      {errors[name]?.message}
                    </p>
                  )}
                </div>
              );
            })}
            <div className="space-y-2">
              <label
                htmlFor="appointment-type"
                className="block text-sm font-semibold"
              >
                Catégorie (obligatoire)
              </label>
              <Select
                id="appointment-type"
                required
                disabled={disabled}
                aria-invalid={Boolean(errors.type)}
                aria-describedby={
                  errors.type ? "appointment-type-error" : undefined
                }
                {...register("type")}
              >
                {appointmentTypeValues.map((type) => (
                  <option key={type} value={type}>
                    {appointmentTypes[type]}
                  </option>
                ))}
              </Select>
              {errors.type && (
                <p
                  id="appointment-type-error"
                  role="alert"
                  className="text-sm text-danger"
                >
                  {errors.type.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Organisation du rendez-vous</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {[
            { name: "reason", label: "Motif administratif", max: 300 },
            { name: "notes", label: "Notes administratives", max: 1000 },
          ].map((field) => {
            const name = field.name as "reason" | "notes";
            return (
              <div key={name} className="space-y-2">
                <label
                  htmlFor={`appointment-${name}`}
                  className="block text-sm font-semibold"
                >
                  {field.label} (facultatif)
                </label>
                <Textarea
                  id={`appointment-${name}`}
                  maxLength={field.max}
                  disabled={disabled}
                  aria-invalid={Boolean(errors[name])}
                  aria-describedby={
                    errors[name]
                      ? `appointment-${name}-error`
                      : "appointment-notes-help"
                  }
                  {...register(name)}
                />
                {errors[name] && (
                  <p
                    id={`appointment-${name}-error`}
                    role="alert"
                    className="text-sm text-danger"
                  >
                    {errors[name]?.message}
                  </p>
                )}
              </div>
            );
          })}
          <p
            id="appointment-notes-help"
            className="text-xs leading-5 text-muted-foreground"
          >
            Informations d’organisation uniquement. Utilisez des valeurs
            fictives.
          </p>
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
        <Button asChild variant="outline">
          <Link
            href={
              appointment
                ? `/demo/rendez-vous/${appointment.id}`
                : `/demo/rendez-vous?date=${initialDate}`
            }
          >
            Annuler la saisie
          </Link>
        </Button>
        <Button type="submit" disabled={disabled}>
          <Save aria-hidden="true" />
          {isSubmitting
            ? "Enregistrement en mémoire…"
            : appointment
              ? "Enregistrer en mémoire"
              : "Créer le rendez-vous fictif"}
        </Button>
      </div>
    </form>
  );
}
