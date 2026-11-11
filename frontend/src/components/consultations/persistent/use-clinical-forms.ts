"use client";
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/components/auth/auth-provider";
import { requireLogin } from "@/lib/api/session-request";
import { createConsultationApi } from "@/lib/consultations/api/client";
import { createClinicalMutation } from "@/lib/consultations/api/mutation";
import { clinicalDraftCommand, clinicalDraftFormSchema, clinicalDraftValues, clinicalTreatmentFormSchema,
  type ClinicalDraftFormValues, type ClinicalTreatmentFormValues } from "@/lib/consultations/api/forms";
import { persistentConsultationSchema, type PersistentConsultation, type PersistentTreatment } from "@/lib/consultations/api/schemas";

export function useClinicalApi() {
  const { state, user, checking } = useAuth();
  const allowed = state.status === "authenticated" && user?.role === "DENTIST" && !checking;
  const userId = user?.id;
  const [permission] = useState(() => {
    let current = { allowed, userId };
    return {
      update(nextAllowed: boolean, nextUserId: string | undefined) { current = { allowed: nextAllowed, userId: nextUserId }; },
      allows(owner: string | undefined) { return current.allowed && current.userId === owner; },
    };
  });
  useLayoutEffect(() => { permission.update(allowed, userId); }, [permission, allowed, userId]);
  const api = useMemo(() => createConsultationApi({
    canAccess: () => permission.allows(userId),
    unauthenticated: requireLogin,
  }), [permission, userId]);
  return { api, allowed, userId: user?.id };
}
function useClinicalMutation(version?: number) {
  const { api, allowed: clinicalAllowed, userId } = useClinicalApi();
  const [owner] = useState(userId);
  const allowed = clinicalAllowed && owner !== undefined && owner === userId;
  const [controller] = useState(() => createClinicalMutation(version, allowed));
  useEffect(() => { controller.setAllowed(allowed); }, [controller, allowed]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { api, allowed, controller, state, disabled: !allowed || state.pending || state.blocked || state.completed };
}
type Saved = { onSaved?: (record: PersistentConsultation) => void };

export function useClinicalDraftForm({ initial, defaultValues, onSaved }: Saved & {
  initial?: PersistentConsultation; defaultValues: ClinicalDraftFormValues;
}) {
  const mutation = useClinicalMutation(initial?.version);
  const [identity] = useState(() => initial ? { id: initial.id, patientId: initial.patientId } : null);
  const [status, setStatus] = useState(initial?.status);
  const form = useForm<ClinicalDraftFormValues>({ resolver: zodResolver(clinicalDraftFormSchema), defaultValues });
  const readOnly = status === "TERMINEE" || initial?.status === "TERMINEE"
    || (identity !== null && (identity.id !== initial?.id || identity.patientId !== initial?.patientId));
  const submit = form.handleSubmit(async values => {
    if (!mutation.allowed || readOnly) return;
    const input = clinicalDraftCommand(values);
    if (identity && values.patientId !== identity.patientId) {
      form.setError("patientId", { message: "Le patient de cette consultation ne peut pas être changé." }); return;
    }
    const result = await mutation.controller.submit(version => identity
      ? mutation.api.update(identity.patientId, identity.id, { version: version!, content: input.content })
      : mutation.api.create(input));
    if (result) onSaved?.(result);
  });
  function acceptReload(record: PersistentConsultation, confirmed: boolean) {
    const parsed = persistentConsultationSchema.safeParse(record);
    if (!identity || !parsed.success || record.id !== identity.id || record.patientId !== identity.patientId
      || !mutation.controller.acceptReload(record.version, confirmed)) return false;
    setStatus(record.status); form.reset(clinicalDraftValues(record.patientId, record.content)); return true;
  }
  return { form, submit, acceptReload, state: mutation.state, allowed: mutation.allowed, disabled: mutation.disabled || readOnly };
}

export function useClinicalTreatmentForm({ consultation, treatment, onSaved }: Saved & {
  consultation: PersistentConsultation; treatment?: PersistentTreatment;
}) {
  const mutation = useClinicalMutation(consultation.version);
  const [identity] = useState(() => ({ id: consultation.id, patientId: consultation.patientId, treatmentId: treatment?.id }));
  const [unavailable, setUnavailable] = useState(false);
  const form = useForm<ClinicalTreatmentFormValues>({ resolver: zodResolver(clinicalTreatmentFormSchema),
    defaultValues: treatment?.content ?? { treatmentDate: consultation.content.consultationDate, description: "", toothReference: "", notes: "" } });
  const readOnly = unavailable || consultation.status === "TERMINEE" || identity.id !== consultation.id
    || identity.patientId !== consultation.patientId || identity.treatmentId !== treatment?.id
    || (identity.treatmentId !== undefined && !consultation.treatments.some(t => t.id === identity.treatmentId));
  const submit = form.handleSubmit(async content => {
    if (!mutation.allowed || readOnly) return;
    const result = await mutation.controller.submit(version => identity.treatmentId
      ? mutation.api.editTreatment(identity.patientId, identity.id, identity.treatmentId, { version: version!, content })
      : mutation.api.addTreatment(identity.patientId, identity.id, { version: version!, content }));
    if (result) onSaved?.(result);
  });
  function acceptReload(record: PersistentConsultation, confirmed: boolean) {
    if (!persistentConsultationSchema.safeParse(record).success || record.id !== identity.id || record.patientId !== identity.patientId
      || !mutation.controller.acceptReload(record.version, confirmed)) return false;
    const current = record.treatments.find(t => t.id === identity.treatmentId);
    setUnavailable(record.status === "TERMINEE" || (identity.treatmentId !== undefined && !current));
    if (current) form.reset(current.content); // New, unsaved treatment input is kept on an explicit parent reload.
    return true;
  }
  return { form, submit, acceptReload, state: mutation.state, allowed: mutation.allowed, disabled: mutation.disabled || readOnly };
}

/** Compose with the existing accessible ClinicalConfirmation. No request until submit(true). */
export function useClinicalAction({ consultation, kind, treatmentId, onSaved }: Saved & {
  consultation: PersistentConsultation; kind: "remove" | "finalize"; treatmentId?: string;
}) {
  const mutation = useClinicalMutation(consultation.version);
  const [identity] = useState(() => ({ id: consultation.id, patientId: consultation.patientId, treatmentId, kind }));
  const [unavailable, setUnavailable] = useState(false);
  const readOnly = unavailable || consultation.status === "TERMINEE" || consultation.id !== identity.id
    || consultation.patientId !== identity.patientId || kind !== identity.kind || treatmentId !== identity.treatmentId
    || (kind === "remove" && !consultation.treatments.some(t => t.id === treatmentId));
  async function submit(confirmed: boolean) {
    if (confirmed !== true || !mutation.allowed || readOnly) return;
    const result = await mutation.controller.submit(version => kind === "finalize"
      ? mutation.api.finalize(identity.patientId, identity.id, version!)
      : mutation.api.removeTreatment(identity.patientId, identity.id, identity.treatmentId!, version!));
    if (result) onSaved?.(result);
    return result;
  }
  function acceptReload(record: PersistentConsultation, confirmed: boolean) {
    if (!persistentConsultationSchema.safeParse(record).success || record.id !== identity.id || record.patientId !== identity.patientId
      || !mutation.controller.acceptReload(record.version, confirmed)) return false;
    setUnavailable(record.status === "TERMINEE" || (kind === "remove" && !record.treatments.some(t => t.id === treatmentId)));
    return true;
  }
  const confirmation = kind === "finalize" ? { title: "Terminer la consultation ?", confirmLabel: "Terminer la consultation",
    description: "Le compte rendu et ses soins ne pourront plus être modifiés après confirmation." }
    : { title: "Retirer ce soin ?", confirmLabel: "Retirer le soin",
      description: "Le soin sera retiré du compte rendu actif. Il restera conservé dans l’historique des retraits." };
  return { submit, acceptReload, confirmation, state: mutation.state, allowed: mutation.allowed, disabled: mutation.disabled || readOnly };
}
