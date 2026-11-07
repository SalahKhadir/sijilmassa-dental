"use client";
import { useFormContext, useWatch, type FieldPath } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  medicalHistoryOptions,
  allergyOptions,
  type CreatePatientInput,
} from "@/lib/patients/types";

function PatientField({
  name,
  label,
  disabled,
  type = "text",
  multiline = false,
  required = false,
  maxLength,
  max,
  help,
}: {
  name: FieldPath<CreatePatientInput>;
  label: string;
  disabled: boolean;
  type?: string;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
  max?: string;
  help?: string;
}) {
  const { register, getFieldState, formState } =
    useFormContext<CreatePatientInput>();
  const error = getFieldState(name, formState).error;
  const describedBy =
    [help ? `${name}-help` : "", error ? `${name}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  const props = {
    id: name,
    disabled,
    required,
    maxLength,
    "aria-invalid": Boolean(error),
    "aria-describedby": describedBy,
    ...register(name),
  };
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={name} className="block text-sm font-semibold">
        {label}
        {required && (
          <span className="font-normal text-muted-foreground">
            {" "}
            (obligatoire)
          </span>
        )}
      </label>
      {multiline ? (
        <Textarea {...props} />
      ) : (
        <Input {...props} type={type} max={max} autoComplete="off" />
      )}
      {help && (
        <p
          id={`${name}-help`}
          className="text-xs leading-5 text-muted-foreground"
        >
          {help}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}
    </div>
  );
}
export function PatientIdentityFields({
  disabled,
  today,
}: {
  disabled: boolean;
  today: string;
}) {
  const { register } = useFormContext<CreatePatientInput>();
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <PatientField
        name="identity.lastName"
        label="Nom"
        required
        maxLength={80}
        disabled={disabled}
      />
      <PatientField
        name="identity.firstName"
        label="Prénom"
        required
        maxLength={80}
        disabled={disabled}
      />
      <div className="space-y-2">
        <label htmlFor="patient-sex" className="block text-sm font-semibold">
          Sexe
        </label>
        <Select
          id="patient-sex"
          disabled={disabled}
          {...register("identity.sex")}
        >
          <option value="unanswered">Non renseigné</option>
          <option value="F">F</option>
          <option value="M">M</option>
        </Select>
      </div>
      <PatientField
        name="identity.dateOfBirth"
        label="Date de naissance"
        type="date"
        max={today}
        disabled={disabled}
      />
      <PatientField
        name="identity.gsm"
        label="GSM"
        type="tel"
        maxLength={40}
        disabled={disabled}
        help="Exemple fictif +212 6XX XX 00 00. Formats locaux et internationaux acceptés."
      />
      <PatientField
        name="identity.landline"
        label="Téléphone fixe"
        type="tel"
        maxLength={40}
        disabled={disabled}
      />
      <PatientField
        name="identity.address"
        label="Adresse"
        multiline
        maxLength={300}
        disabled={disabled}
      />
      <PatientField
        name="identity.profession"
        label="Profession"
        maxLength={120}
        disabled={disabled}
      />
      <PatientField
        name="identity.cin"
        label="CIN N°"
        type="password"
        maxLength={30}
        disabled={disabled}
        help="Donnée personnelle sensible. Utilisez une valeur fictive ; elle est masquée dans les vues générales."
      />
      <PatientField
        name="identity.medicalCoverage"
        label="Couverture médicale"
        maxLength={120}
        disabled={disabled}
      />
      <div className="space-y-2">
        <label
          htmlFor="administrative-status"
          className="block text-sm font-semibold"
        >
          Statut administratif
        </label>
        <Select
          id="administrative-status"
          disabled={disabled}
          {...register("status")}
        >
          <option value="active">Actif</option>
          <option value="inactive">Inactif</option>
        </Select>
      </div>
    </div>
  );
}
function ReportStatusField({
  group,
  disabled,
}: {
  group: "medicalHistory" | "allergies";
  disabled: boolean;
}) {
  const {
    register,
    setValue,
    formState: { errors },
  } = useFormContext<CreatePatientInput>();
  const registration = register(`${group}.reportStatus`);
  const error = errors[group]?.reportStatus;
  return (
    <div className="mb-5 max-w-sm space-y-2">
      <label
        htmlFor={`${group}-status`}
        className="block text-sm font-semibold"
      >
        État du recueil
      </label>
      <Select
        id={`${group}-status`}
        disabled={disabled}
        {...registration}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${group}-status-error` : undefined}
        onChange={(event) => {
          void registration.onChange(event);
          if (event.target.value === "unanswered") {
            if (group === "medicalHistory") {
              setValue("medicalHistory.conditions", []);
              setValue("medicalHistory.otherDetails", "");
            } else {
              setValue("allergies.categories", []);
              setValue("allergies.clarification", "");
            }
          }
        }}
      >
        <option value="unanswered">Non renseigné</option>
        <option value="reported">Renseigné</option>
      </Select>
      {error && (
        <p
          id={`${group}-status-error`}
          role="alert"
          className="text-sm text-danger"
        >
          {error.message}
        </p>
      )}
    </div>
  );
}
export function MedicalHistoryFields({ disabled }: { disabled: boolean }) {
  const { register, setValue, control } = useFormContext<CreatePatientInput>();
  const selected = useWatch({ control, name: "medicalHistory.conditions" });
  return (
    <>
      <ReportStatusField group="medicalHistory" disabled={disabled} />
      <fieldset disabled={disabled}>
        <legend className="mb-4 text-sm font-semibold">
          Avez-vous ou avez-vous déjà eu un des problèmes suivants ?
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {medicalHistoryOptions.map((option) => (
            <label
              key={option}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                value={option}
                className="size-4 accent-primary"
                {...register("medicalHistory.conditions", {
                  onChange: (event) => {
                    setValue("medicalHistory.reportStatus", "reported");
                    if (
                      event.target.value === "Autres" &&
                      !event.target.checked
                    )
                      setValue("medicalHistory.otherDetails", "");
                  },
                })}
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-6">
        <PatientField
          name="medicalHistory.otherDetails"
          label="Précisions pour Autres"
          multiline
          maxLength={1000}
          disabled={disabled || !selected.includes("Autres")}
        />
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Le groupe peut rester non renseigné. Une case non cochée ne permet pas
        de conclure à l’absence d’un problème de santé.
      </p>
    </>
  );
}
function YesNoField({
  name,
  label,
  disabled,
}: {
  name:
    | "healthQuestionnaire.underMedicalTreatment"
    | "healthQuestionnaire.pregnant";
  label: string;
  disabled: boolean;
}) {
  const { register } = useFormContext<CreatePatientInput>();
  return (
    <fieldset disabled={disabled} className="rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {[
          { value: "unanswered", label: "Non renseigné" },
          { value: "yes", label: "Oui" },
          { value: "no", label: "Non" },
        ].map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="radio"
              value={option.value}
              className="size-4 accent-primary"
              {...register(name)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function AllergiesAndHealthFields({ disabled }: { disabled: boolean }) {
  const { register, setValue } = useFormContext<CreatePatientInput>();
  return (
    <div className="space-y-7">
      <div>
        <h3 className="mb-4 text-base font-semibold">Allergies</h3>
        <ReportStatusField group="allergies" disabled={disabled} />
        <fieldset disabled={disabled}>
          <legend className="mb-4 text-sm font-semibold">
            Avez-vous une allergie contre une de ces substances ?
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {allergyOptions.map((option) => (
              <label
                key={option}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  value={option}
                  className="size-4 accent-primary"
                  {...register("allergies.categories", {
                    onChange: () =>
                      setValue("allergies.reportStatus", "reported"),
                  })}
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5">
          <PatientField
            name="allergies.clarification"
            label="Précisions sur les allergies"
            multiline
            disabled={disabled}
            maxLength={1000}
            help="Catégories rapportées, sans confirmation diagnostique. Pour ajouter un texte, choisissez Renseigné dans l’état du recueil."
          />
        </div>
      </div>
      <YesNoField
        name="healthQuestionnaire.underMedicalTreatment"
        label="Êtes-vous sous traitement médical ?"
        disabled={disabled}
      />
      <YesNoField
        name="healthQuestionnaire.pregnant"
        label="Êtes-vous enceinte ?"
        disabled={disabled}
      />
      <PatientField
        name="healthQuestionnaire.additionalInformation"
        label="Avez-vous quelque chose à ajouter sur votre santé ?"
        multiline
        maxLength={2000}
        disabled={disabled}
      />
      <PatientField
        name="healthQuestionnaire.reasonForConsultation"
        label="Motif de consultation"
        multiline
        maxLength={2000}
        disabled={disabled}
      />
    </div>
  );
}
