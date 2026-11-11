"use client";
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/components/auth/auth-provider";
import { requireLogin } from "@/lib/api/session-request";
import { createPrescriptionApi, PrescriptionApiError } from "@/lib/prescriptions/api/client";
import { createPrescriptionMutation } from "@/lib/prescriptions/api/mutation";
import { prescriptionDraftCommand, prescriptionDraftFormSchema, prescriptionDraftValues, type PrescriptionDraftFormValues } from "@/lib/prescriptions/api/forms";
import { persistentPrescriptionSchema, type PersistentPrescription } from "@/lib/prescriptions/api/schemas";
import { savePrescriptionPdf } from "@/lib/prescriptions/api/download";

export function usePrescriptionApi() {
  const { state, user, checking } = useAuth();
  const allowed = state.status === "authenticated" && user?.role === "DENTIST" && !checking;
  const userId = user?.id;
  const [permission] = useState(() => {
    let current = { allowed, userId };
    return { update(nextAllowed: boolean, nextUserId: string | undefined) { current = { allowed: nextAllowed, userId: nextUserId }; },
      allows(owner: string | undefined) { return current.allowed && current.userId === owner; } };
  });
  useLayoutEffect(() => { permission.update(allowed, userId); return () => permission.update(false, undefined); }, [permission, allowed, userId]);
  const api = useMemo(() => createPrescriptionApi({ canAccess: () => permission.allows(userId), unauthenticated: requireLogin }), [permission, userId]);
  return { api, allowed, userId };
}
function usePrescriptionMutation(version?: number) {
  const { api, allowed: access, userId } = usePrescriptionApi();
  const [owner] = useState(userId);
  const allowed = access && owner !== undefined && owner === userId;
  const [controller] = useState(() => createPrescriptionMutation(version, allowed));
  useLayoutEffect(() => { controller.setAllowed(allowed); return () => controller.setAllowed(false); }, [controller, allowed]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { api, allowed, controller, state, disabled: !allowed || state.pending || state.blocked || state.completed };
}
const editable = (record: PersistentPrescription) => record.status === "BROUILLON" && record.archivedAt === null
  && record.patient.status === "active" && record.version < Number.MAX_SAFE_INTEGER;
type Saved = { onSaved?: (record: PersistentPrescription) => void };
/** Mount only in a verified dentist boundary; key the owning screen by session and record. */
export function usePrescriptionDraftForm({ initial, defaultValues, onSaved }: Saved & {
  initial?: PersistentPrescription; defaultValues: PrescriptionDraftFormValues;
}) {
  const mutation = usePrescriptionMutation(initial?.version);
  const [identity] = useState(() => initial ? { id: initial.id, patientId: initial.patientId } : null);
  const [current, setCurrent] = useState(initial);
  const form = useForm<PrescriptionDraftFormValues>({ resolver: zodResolver(prescriptionDraftFormSchema), defaultValues });
  // keyName preserves the server line UUID; RHF's generated key never enters the payload.
  const lines = useFieldArray({ control: form.control, name: "medications", keyName: "formKey" });
  const readOnly = (current !== undefined && !editable(current))
    || (identity !== null && (identity.id !== initial?.id || identity.patientId !== initial?.patientId));
  const disabled = mutation.disabled || readOnly;
  const submit = form.handleSubmit(async values => {
    if (disabled) return;
    const input = prescriptionDraftCommand(values);
    if (identity && values.patientId !== identity.patientId) {
      form.setError("patientId", { message: "Le patient de cette ordonnance ne peut pas être changé." }); return;
    }
    const result = await mutation.controller.submit(version => identity
      ? mutation.api.update(identity.patientId, identity.id, { version: version!, content: input.content })
      : mutation.api.create(input));
    if (result) onSaved?.(result);
  });
  function acceptReload(record: PersistentPrescription, confirmed: boolean) {
    if (!identity || !persistentPrescriptionSchema.safeParse(record).success || record.id !== identity.id || record.patientId !== identity.patientId
      || !mutation.allowed || !mutation.controller.acceptReload(record.version, confirmed)) return false;
    setCurrent(record); form.reset(prescriptionDraftValues(record.patientId, record.content)); return true;
  }
  return { form, submit, acceptReload, state: mutation.state, allowed: mutation.allowed, disabled,
    medications: { fields: lines.fields,
      append() { if (!disabled && form.getValues("medications").length < 20) lines.append({ medicationName: "", dosage: "", frequency: "", duration: "", instructions: "" }); },
      remove(index: number, confirmed: boolean) { if (!disabled && confirmed === true && index >= 0 && index < lines.fields.length) lines.remove(index); },
      move(from: number, to: number) { if (!disabled && from >= 0 && to >= 0 && from < lines.fields.length && to < lines.fields.length) lines.move(from, to); },
    } };
}
/** Pass confirmation to PrescriptionActionConfirmation. No write until submit(true). */
export function usePrescriptionAction({ prescription, kind, onSaved }: Saved & {
  prescription: PersistentPrescription; kind: "archive" | "finalize";
}) {
  const mutation = usePrescriptionMutation(prescription.version);
  const [identity] = useState(() => ({ id: prescription.id, patientId: prescription.patientId, kind }));
  const [current, setCurrent] = useState(prescription);
  const readOnly = !editable(current) || !editable(prescription) || identity.id !== prescription.id
    || identity.patientId !== prescription.patientId || identity.kind !== kind;
  async function submit(confirmed: boolean) {
    if (confirmed !== true || !mutation.allowed || readOnly) return;
    const result = await mutation.controller.submit(version => kind === "finalize"
      ? mutation.api.finalize(identity.patientId, identity.id, { version: version!, patientVersion: current.patient.version })
      : mutation.api.archive(identity.patientId, identity.id, version!));
    if (result) onSaved?.(result);
    return result;
  }
  function acceptReload(record: PersistentPrescription, confirmed: boolean) {
    if (!persistentPrescriptionSchema.safeParse(record).success || record.id !== identity.id || record.patientId !== identity.patientId
      || !mutation.allowed || !mutation.controller.acceptReload(record.version, confirmed)) return false;
    setCurrent(record); return true;
  }
  const confirmation = kind === "finalize" ? { title: "Finaliser cette ordonnance ?", confirmLabel: "Finaliser l’ordonnance",
    description: `Patient : ${current.patient.displayName}. Date : ${current.content.issuedDate}. Version de l’ordonnance : ${current.version}. Version du patient : ${current.patient.version}. La finalisation est irréversible. Le contenu et le PDF seront conservés en lecture seule.` }
    : { title: "Archiver ce brouillon ?", confirmLabel: "Archiver le brouillon", description: "Le brouillon restera dans l’historique et ne pourra plus être modifié ni finalisé." };
  return { submit, acceptReload, confirmation, state: mutation.state, allowed: mutation.allowed, disabled: mutation.disabled || readOnly };
}
/** No Blob URL or clinical response survives the explicit download operation. */
export function useFinalizedPrescriptionDownload(prescription: PersistentPrescription) {
  const { api, allowed, userId } = usePrescriptionApi();
  const [owner] = useState(userId);
  const gate = useRef(false);
  const active = useRef<object | null>(null);
  useLayoutEffect(() => {
    active.current = {};
    return () => { active.current = null; };
  }, [prescription.id, prescription.patientId, prescription.version, allowed, userId]);
  const [state, setState] = useState<{ pending: boolean; error?: PrescriptionApiError }>({ pending: false });
  const disabled = !allowed || owner !== userId || state.pending || prescription.status !== "FINALISEE";
  async function download(consume: typeof savePrescriptionPdf = savePrescriptionPdf) {
    if (disabled || gate.current) return;
    const requestOwner = active.current;
    gate.current = true; setState({ pending: true });
    try {
      const result = await api.download(prescription.patientId, prescription.id, prescription.version);
      if (requestOwner === null || active.current !== requestOwner) return;
      consume(result); setState({ pending: false });
    } catch (error) {
      if (active.current === requestOwner) setState({ pending: false, error: error instanceof PrescriptionApiError ? error : new PrescriptionApiError(503) });
    }
    finally { gate.current = false; if (active.current !== requestOwner) setState({ pending: false }); }
  }
  return { download, disabled, state };
}
