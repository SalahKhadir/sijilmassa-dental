"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Download,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePatients } from "@/components/patients/patient-provider";
import { useConsultations } from "@/components/consultations/consultation-provider";
import { useInsurance } from "./insurance-provider";
import { CnssPdfActions } from "./cnss-pdf-actions";
import { CnssDentalChart } from "./cnss-dental-chart";
import { InsuranceDentalChart } from "./insurance-dental-chart";
import { InsurancePdfActions } from "./insurance-pdf-actions";
import { FarDentalChart } from "./far-dental-chart";
import { cnopsChartViewport, cnopsToothPositions } from "@/lib/insurance/pdf/cnops-chart-mapping";
import type { InsurancePdfInput } from "@/lib/insurance/pdf/overlay";
import type {
  BeneficiaryRelationship,
  CNSSCareType,
  CNOPSCareType,
  CreateInsuranceDraftInput,
  DentalInsuranceAct,
  DocumentPurpose,
  FARCareContext,
  FARCareType,
  FARDentalPurpose,
  FARToothMark,
  InsuranceDocumentDraft,
  InsuranceProvider,
  PatientInsurancePolicy,
  UpdateInsuranceDraftInput,
} from "@/lib/insurance/types";
import {
  beneficiaryRelationships,
  cnopsCareTypeLabels,
  cnopsCareTypes,
  cnssCareTypeLabels,
  cnssCareTypes,
  farCareContextLabels,
  farCareContexts,
  farCareTypeLabels,
  farCareTypes,
  farDentalPurposeLabels,
  farDentalPurposes,
  insuranceProviders,
  relationshipLabels,
} from "@/lib/insurance/types";
import { clinicDate } from "@/lib/patients/dates";
import { formatMinor, minorInput, parseMinor, sumMinor } from "@/lib/billing/money";
import type { Patient } from "@/lib/patients/types";
import type { Consultation } from "@/lib/consultations/types";

const cnopsChartConfig = {
  provider: "CNOPS" as const,
  viewport: cnopsChartViewport,
  positions: cnopsToothPositions,
  imageHref: "/images/cnops-dental-chart.png",
  note: "L’arcade temporaire comporte cinq dents par quadrant sans numéros locaux lisibles. La correspondance FDI part de la ligne médiane ; vérifiez les positions avant confirmation.",
};

interface InsuranceDraftFormProps {
  initialDraft?: InsuranceDocumentDraft;
  presetPatientId?: string;
}

export function InsuranceDraftForm({
  initialDraft,
  presetPatientId,
}: InsuranceDraftFormProps) {
  const router = useRouter();
  const { repository: patientsRepo, revision: patientsRevision } = usePatients();
  const { repository: consultationsRepo, revision: consultationsRevision } = useConsultations();
  const {
    repository: insuranceRepo,
    revision: insuranceRevision,
    createDraft,
    updateDraft,
    createPolicy,
  } = useInsurance();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    initialDraft?.patientId || presetPatientId || "",
  );
  const [patientPolicies, setPatientPolicies] = useState<
    PatientInsurancePolicy[]
  >([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState(initialDraft?.policyId ?? "");
  const [provider, setProvider] = useState<InsuranceProvider>(
    initialDraft?.provider || "CNSS",
  );
  const [documentPurpose, setDocumentPurpose] = useState<DocumentPurpose>(
    initialDraft?.documentPurpose || "EXECUTION",
  );
  const [selectedConsultationId, setSelectedConsultationId] = useState<string>(
    initialDraft?.selectedConsultationId || "",
  );
  const [selectedTreatmentIds, setSelectedTreatmentIds] = useState<string[]>(
    initialDraft?.selectedTreatmentIds || [],
  );

  // Acts
  const [acts, setActs] = useState<DentalInsuranceAct[]>(
    initialDraft?.acts || [
      {
        id: "act-new-1",
        treatmentDate: clinicDate(),
        toothReference: "",
        description: "",
        actCode: "",
        ngapKeyLetter: "",
        ngapCoefficient: undefined,
        amountMinor: undefined,
      },
    ],
  );

  // Confirmation belongs to one patient; changing the patient never carries marks over.
  const [chartSelection, setChartSelection] = useState({
    patientId: initialDraft?.patientId ?? presetPatientId ?? "",
    teeth: initialDraft?.cnssDetails?.confirmedTeeth ?? [],
  });
  const confirmedTeeth = chartSelection.patientId === selectedPatientId ? chartSelection.teeth : [];

  // CNSS Details
  const [cnssCareTypesSelected, setCnssCareTypesSelected] = useState<
    CNSSCareType[]
  >(initialDraft?.cnssDetails?.careTypes ?? []);
  const [cnssPriorAuth, setCnssPriorAuth] = useState(
    initialDraft?.cnssDetails?.priorAuthorizationNumber || "",
  );
  const [cnssAccidentDate, setCnssAccidentDate] = useState(
    initialDraft?.cnssDetails?.accidentDate || "",
  );

  const [cnopsChartSelection, setCnopsChartSelection] = useState({
    patientId: initialDraft?.patientId ?? presetPatientId ?? "",
    teeth: initialDraft?.cnopsDetails?.confirmedTeeth ?? [],
  });
  const cnopsConfirmedTeeth = cnopsChartSelection.patientId === selectedPatientId ? cnopsChartSelection.teeth : [];
  const [cnopsInpe, setCnopsInpe] = useState(initialDraft?.cnopsDetails?.practitionerInpe ?? "");

  // CNOPS Details
  const [cnopsCareTypesSelected, setCnopsCareTypesSelected] = useState<
    CNOPSCareType[]
  >(initialDraft?.cnopsDetails?.careTypes ?? []);
  const [cnopsPriorAuth, setCnopsPriorAuth] = useState(
    initialDraft?.cnopsDetails?.priorAuthorizationNumber || "",
  );
  const [cnopsAccidentDate, setCnopsAccidentDate] = useState(
    initialDraft?.cnopsDetails?.accidentDate || "",
  );
  const [cnopsAccidentCauses, setCnopsAccidentCauses] = useState(
    initialDraft?.cnopsDetails?.accidentCauses || "",
  );
  const [cnopsCim10, setCnopsCim10] = useState(
    initialDraft?.cnopsDetails?.diagnosisCodeCIM10 || "",
  );

  // FAR Details
  const [farDentalPurpose, setFarDentalPurpose] = useState<FARDentalPurpose | "">(
    initialDraft?.farDetails?.dentalPurpose ?? "",
  );
  const [farCareType, setFarCareType] = useState<FARCareType | "">(
    initialDraft?.farDetails?.careType ?? "",
  );
  const [farCareContext, setFarCareContext] = useState<FARCareContext | "">(
    initialDraft?.farDetails?.context ?? "",
  );
  const [farPriorAuth, setFarPriorAuth] = useState(
    initialDraft?.farDetails?.priorAuthorizationNumber || "",
  );

  const [farInpe, setFarInpe] = useState(initialDraft?.farDetails?.practitionerInpe ?? "");
  const [farProspectusCount, setFarProspectusCount] = useState<number | undefined>(initialDraft?.farDetails?.prospectusCount);
  const [farChartSelection, setFarChartSelection] = useState({
    patientId: initialDraft?.patientId ?? presetPatientId ?? "",
    marks: initialDraft?.farDetails?.toothMarks ?? [] as FARToothMark[],
    approvalBasis: initialDraft?.farDetails?.markingApproved === true ? JSON.stringify(initialDraft.acts) : "",
  });
  const farMarks = farChartSelection.patientId === selectedPatientId ? farChartSelection.marks : [];
  const farMarkingApproved = farChartSelection.patientId === selectedPatientId && farChartSelection.approvalBasis === JSON.stringify(acts);

  // Manual fields
  const [declarationPlace, setDeclarationPlace] = useState(
    initialDraft?.manualFields?.declarationPlace ?? "",
  );
  const [declarationDate, setDeclarationDate] = useState(
    initialDraft?.manualFields?.declarationDate ?? "",
  );
  const [attachmentCount, setAttachmentCount] = useState<number | undefined>(
    initialDraft?.manualFields?.attachmentCount,
  );

  // Quick policy creation inline if patient has no policy
  const [quickRegNum, setQuickRegNum] = useState("");
  const [quickAffiliationNum, setQuickAffiliationNum] = useState("");
  const [quickInsuredIsPatient, setQuickInsuredIsPatient] = useState(true);
  const [quickInsuredName, setQuickInsuredName] = useState("");
  const [quickInsuredRelationship, setQuickInsuredRelationship] =
    useState<BeneficiaryRelationship>("LUI_MEME");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load patients and consultations
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [patList, consList] = await Promise.all([
          patientsRepo.list(),
          consultationsRepo.list(),
        ]);

        if (!cancelled) {
          setPatients(patList);
          setConsultations(consList);
          if (!selectedPatientId && patList.length > 0) {
            setSelectedPatientId(patList[0].id);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [patientsRepo, consultationsRepo, selectedPatientId, patientsRevision, consultationsRevision]);

  const lastPolicyPatient = useRef<string | undefined>(undefined);

  // Load policies for selected patient
  useEffect(() => {
    let cancelled = false;

    async function loadPolicies() {
      if (!selectedPatientId) {
        setPatientPolicies([]);
        return;
      }
      try {
        const pols = await insuranceRepo.getPoliciesByPatientId(
          selectedPatientId,
        );
        if (!cancelled) {
          setPatientPolicies(pols);
          // If draft does not already have a provider and a policy exists, pick matching provider
          if (!initialDraft && lastPolicyPatient.current !== selectedPatientId && pols.length > 0) {
            setProvider(pols[0].provider);
          }
          lastPolicyPatient.current = selectedPatientId;
        }
      } catch {
        if (!cancelled) setPatientPolicies([]);
      }
    }

    loadPolicies();
    return () => {
      cancelled = true;
    };
  }, [selectedPatientId, insuranceRepo, initialDraft, insuranceRevision]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId),
    [patients, selectedPatientId],
  );

  const availablePolicies = patientPolicies.filter(p => p.patientId === selectedPatientId && p.provider === provider);
  const matchedPolicy = selectedPolicyId
    ? availablePolicies.find(p => p.id === selectedPolicyId)
    : availablePolicies.find(p => p.active);

  const patientConsultations = useMemo(
    () => consultations.filter((c) => c.patientId === selectedPatientId),
    [consultations, selectedPatientId],
  );

  const totalCalculatedMinor = useMemo(
    () => {
      try { return sumMinor(acts.map(act => act.amountMinor ?? 0)); }
      catch { return undefined; }
    },
    [acts],
  );

  const pdfInput: InsurancePdfInput | undefined = selectedPatient ? {
    patient: { id: selectedPatient.id, identity: selectedPatient.identity },
    policy: matchedPolicy,
    draft: {
      patientId: selectedPatientId, provider, policyId: matchedPolicy?.id,
      status: initialDraft?.status ?? "BROUILLON", documentPurpose,
      selectedConsultationId: selectedConsultationId || undefined, selectedTreatmentIds, acts,
      cnssDetails: { confirmedTeeth, careTypes: cnssCareTypesSelected, priorAuthorizationNumber: cnssPriorAuth, accidentDate: cnssAccidentDate },
      cnopsDetails: {
        careTypes: cnopsCareTypesSelected, practitionerInpe: cnopsInpe, confirmedTeeth: cnopsConfirmedTeeth,
        priorAuthorizationNumber: cnopsPriorAuth, accidentDate: cnopsAccidentDate,
        accidentCauses: cnopsAccidentCauses, diagnosisCodeCIM10: cnopsCim10,
      },
      farDetails: {
        dentalPurpose: farDentalPurpose || undefined, careType: farCareType || undefined, context: farCareContext || undefined,
        priorAuthorizationNumber: farPriorAuth, practitionerInpe: farInpe, prospectusCount: farProspectusCount,
        toothMarks: farMarks, markingApproved: farMarkingApproved,
      },
      manualFields: {
        totalFeesMinor: acts.every(a => a.amountMinor !== undefined) ? totalCalculatedMinor : undefined,
        attachmentCount, declarationPlace, declarationDate,
      },
    },
  } : undefined;

  function invalidateChartConfirmation() {
    setChartSelection({ patientId: selectedPatientId, teeth: [] });
    setCnopsChartSelection({ patientId: selectedPatientId, teeth: [] });
    setFarChartSelection(prev => ({ ...prev, approvalBasis: "" }));
  }

  function changePatient(patientId: string) {
    setSelectedPatientId(patientId);
    setSelectedPolicyId(""); setPatientPolicies([]);
    setActs([{ id: "act-new-1", treatmentDate: clinicDate(), description: "" }]);
    setSelectedConsultationId(""); setSelectedTreatmentIds([]);
    setChartSelection({ patientId, teeth: [] });
    setCnopsChartSelection({ patientId, teeth: [] });
    setFarChartSelection({ patientId, marks: [], approvalBasis: "" });
    setDocumentPurpose("EXECUTION");
    setCnssCareTypesSelected([]); setCnssPriorAuth(""); setCnssAccidentDate("");
    setCnopsCareTypesSelected([]); setCnopsPriorAuth(""); setCnopsAccidentDate("");
    setCnopsAccidentCauses(""); setCnopsCim10("");
    setFarDentalPurpose(""); setFarCareType(""); setFarCareContext(""); setFarPriorAuth("");
    setFarProspectusCount(undefined);
    setDeclarationPlace(""); setDeclarationDate(""); setAttachmentCount(undefined);
    setQuickRegNum(""); setQuickAffiliationNum(""); setQuickInsuredName("");
    setQuickInsuredIsPatient(true); setQuickInsuredRelationship("LUI_MEME"); setError(null);
  }

  // Add / remove / update act lines
  const handleAddAct = () => {
    invalidateChartConfirmation();
    setActs((prev) => [
      ...prev,
      {
        id: `act-new-${Date.now()}-${prev.length + 1}`,
        treatmentDate: clinicDate(),
        toothReference: "",
        description: "",
        actCode: "",
        ngapKeyLetter: "",
        ngapCoefficient: undefined,
        amountMinor: undefined,
      },
    ]);
  };

  const handleRemoveAct = (index: number) => {
    invalidateChartConfirmation();
    const source = acts[index]?.sourceTreatmentId;
    if (source) setSelectedTreatmentIds(prev => prev.filter(id => id !== source));
    setActs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleActChange = (
    index: number,
    field: keyof DentalInsuranceAct,
    value: unknown,
  ) => {
    invalidateChartConfirmation();
    setActs((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [field]: value,
      };
      return copy;
    });
  };

  // Import treatment from clinical records
  const handleImportTreatment = (
    consultationId: string,
    treatmentId: string,
    desc: string,
    date: string,
    tooth: string,
  ) => {
    if (selectedTreatmentIds.includes(treatmentId)) {
      return; // Already imported
    }

    invalidateChartConfirmation();
    setSelectedTreatmentIds((prev) => [...prev, treatmentId]);
    setSelectedConsultationId(consultationId);

    setActs((prev) => [
      ...prev,
      {
        id: `act-imp-${treatmentId}`,
        treatmentDate: date,
        toothReference: tooth || "",
        description: desc,
        actCode: "",
        ngapKeyLetter: "",
        ngapCoefficient: undefined,
        amountMinor: undefined,
        sourceTreatmentId: treatmentId,
      },
    ]);
  };

  // Quick save policy
  const handleCreateQuickPolicy = async () => {
    if (!selectedPatient) return;
    try {
      const parts = quickInsuredName.trim().split(" ");
      const fName = parts[0];
      const lName = parts.slice(1).join(" ");
      if (!quickInsuredIsPatient && (!fName || !lName))
        throw new Error("Saisissez le prénom et le nom de l’assuré distinct du bénéficiaire.");

      const newPol = await createPolicy({
        patientId: selectedPatient.id,
        provider,
        registrationNumber: quickRegNum.trim(),
        affiliationNumber: quickAffiliationNum.trim(),
        militaryAccountNumber: "",
        militaryRank: "",
        militaryUnit: "",
        insuredPerson: {
          isPatient: quickInsuredIsPatient,
          firstName: quickInsuredIsPatient
            ? selectedPatient.identity.firstName
            : fName,
          lastName: quickInsuredIsPatient
            ? selectedPatient.identity.lastName
            : lName,
          cin: quickInsuredIsPatient
            ? selectedPatient.identity.cin || ""
            : "",
          address: quickInsuredIsPatient ? selectedPatient.identity.address || "" : "",
          phone: quickInsuredIsPatient ? selectedPatient.identity.gsm || selectedPatient.identity.landline || "" : "",
          relationship: quickInsuredIsPatient
            ? "LUI_MEME"
            : quickInsuredRelationship,
        },
        active: true,
      });

      setPatientPolicies((prev) => [...prev, newPol]);
      setSelectedPolicyId(newPol.id);
      setQuickRegNum("");
      setQuickAffiliationNum("");
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message);
    }
  };

  // Submit form
  const handleSave = async (targetStatus: "BROUILLON" | "VALIDE") => {
    setError(null);
    setSubmitting(true);

    try {
      if (!selectedPatientId) {
        throw new Error("Veuillez sélectionner un patient.");
      }

      if (totalCalculatedMinor === undefined)
        throw new Error("Le total dépasse la précision monétaire autorisée. Corrigez les honoraires.");
      if (acts.length === 0) {
        throw new Error(
          "Veuillez ajouter au moins un acte dentaire sur la feuille de soins.",
        );
      }

      for (let i = 0; i < acts.length; i++) {
        const a = acts[i];
        if (!a.description.trim()) {
          throw new Error(`La ligne d’acte ${i + 1} requiert une description.`);
        }
        if (!a.treatmentDate) {
          throw new Error(
            `La ligne d’acte ${i + 1} requiert une date de soin valide.`,
          );
        }
      }

      const input: CreateInsuranceDraftInput = {
        patientId: selectedPatientId,
        provider,
        policyId: matchedPolicy?.id,
        status: targetStatus,
        documentPurpose,
        selectedConsultationId: selectedConsultationId || undefined,
        selectedTreatmentIds,
        acts: acts.map((act) => ({
          ...act,
          toothReference: act.toothReference?.trim() || undefined,
          actCode: act.actCode?.trim() || undefined,
          ngapKeyLetter: act.ngapKeyLetter?.trim() || undefined,
          ngapCoefficient: act.ngapCoefficient,
          amountMinor: act.amountMinor,
        })),
        cnssDetails:
          provider === "CNSS"
            ? {
                confirmedTeeth,
                careTypes: cnssCareTypesSelected,
                priorAuthorizationNumber: cnssPriorAuth.trim() || undefined,
                accidentDate: cnssAccidentDate.trim() || undefined,
              }
            : undefined,
        cnopsDetails:
          provider === "CNOPS"
            ? {
                careTypes: cnopsCareTypesSelected,
                practitionerInpe: cnopsInpe,
                confirmedTeeth: cnopsConfirmedTeeth,
                priorAuthorizationNumber: cnopsPriorAuth.trim() || undefined,
                accidentDate: cnopsAccidentDate.trim() || undefined,
                accidentCauses: cnopsAccidentCauses.trim() || undefined,
                diagnosisCodeCIM10: cnopsCim10.trim() || undefined,
              }
            : undefined,
        farDetails:
          provider === "FAR"
            ? {
                dentalPurpose: farDentalPurpose || undefined,
                careType: farCareType || undefined,
                context: farCareContext || undefined,
                practitionerInpe: farInpe,
                prospectusCount: farProspectusCount,
                toothMarks: farMarks,
                markingApproved: farMarkingApproved,
                priorAuthorizationNumber: farPriorAuth.trim() || undefined,
              }
            : undefined,
        manualFields: {
          totalFeesMinor: acts.every(a => a.amountMinor !== undefined) ? totalCalculatedMinor : undefined,
          attachmentCount,
          declarationPlace: declarationPlace.trim() || undefined,
          declarationDate: declarationDate.trim() || undefined,
        },
      };

      if (initialDraft) {
        await updateDraft(
          initialDraft.id,
          input as unknown as UpdateInsuranceDraftInput,
        );
      } else {
        await createDraft(input);
      }

      router.push(`/demo/patients/${selectedPatientId}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Une erreur est survenue lors de l’enregistrement.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Chargement des données du cabinet...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <Link
            href={
              selectedPatientId
                ? `/demo/patients/${selectedPatientId}`
                : "/demo/documents"
            }
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline mb-1"
          >
            <ArrowLeft className="size-3.5" />
            Retour
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {initialDraft
              ? `Feuille de soins dentaires — ${initialDraft.provider}`
              : "Nouvelle feuille de soins dentaires"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Préparation du dossier d’assurance maladie (CNSS, CNOPS ou FAR).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSave("BROUILLON")}
            disabled={submitting}
          >
            <Save className="mr-1.5 size-4" />
            Enregistrer en brouillon
          </Button>
          <Button
            type="button"
            onClick={() => handleSave("VALIDE")}
            disabled={submitting}
          >
            <CheckCircle2 className="mr-1.5 size-4" />
            Valider le document
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger flex items-start gap-2"
        >
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid: Left Column (Form Fields) / Right Column (Summary & Clinical Sources) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Patient and Provider */}
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">
                1. Patient et organisme de prise en charge
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="draft-patient"
                    className="block text-xs font-semibold"
                  >
                    Patient bénéficiaire
                  </label>
                  <Select
                    id="draft-patient"
                    value={selectedPatientId}
                    onChange={(e) => changePatient(e.target.value)}
                    disabled={Boolean(initialDraft)}
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.identity.firstName} {p.identity.lastName} (
                        {p.reference})
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="draft-provider"
                    className="block text-xs font-semibold"
                  >
                    Organisme d’assurance
                  </label>
                  <Select
                    id="draft-provider"
                    value={provider}
                    onChange={(e) => {
                      setProvider(e.target.value as InsuranceProvider);
                      setSelectedPolicyId(""); invalidateChartConfirmation();
                    }}
                  >
                    {insuranceProviders.map((p) => (
                      <option key={p} value={p}>
                        {p === "CNSS" && "CNSS (Feuille de soins dentaires)"}
                        {p === "CNOPS" && "CNOPS (Feuille de soins dentaires)"}
                        {p === "FAR" && "FAR (Feuille de maladie / soins)"}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {availablePolicies.length > 1 && <div className="space-y-1.5">
                <label htmlFor="draft-policy" className="block text-xs font-semibold">Couverture liée</label>
                <Select id="draft-policy" value={matchedPolicy?.id ?? ""} onChange={event => {
                  setSelectedPolicyId(event.target.value); invalidateChartConfirmation();
                }}>
                  <option value="">Choisir une couverture</option>
                  {availablePolicies.map(policy => <option key={policy.id} value={policy.id}>
                    {policy.insuredPerson.lastName} {policy.insuredPerson.firstName} — {policy.registrationNumber || policy.militaryAccountNumber || "Sans numéro"}
                  </option>)}
                </Select>
              </div>}
              {/* Policy Status for Selected Patient */}
              {matchedPolicy ? (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">
                      Police d’assurance enregistrée ({matchedPolicy.provider})
                    </span>
                    <span className="text-muted-foreground">
                      Immatriculation : {matchedPolicy.registrationNumber || "—"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Assuré(e) : {matchedPolicy.insuredPerson.firstName}{" "}
                    {matchedPolicy.insuredPerson.lastName} (
                    {relationshipLabels[matchedPolicy.insuredPerson.relationship]})
                    {matchedPolicy.affiliationNumber && (
                      <span> · Affiliation : {matchedPolicy.affiliationNumber}</span>
                    )}
                    {matchedPolicy.militaryAccountNumber && (
                      <span>
                        {" "}
                        · Compte FAR : {matchedPolicy.militaryAccountNumber} (
                        {matchedPolicy.militaryRank})
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs space-y-2">
                  <p className="font-semibold text-warning">
                    Aucune police {provider} n’est actuellement associée à ce
                    patient.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 pt-1">
                    <Input
                      placeholder="N° Immatriculation / Matricule"
                      value={quickRegNum}
                      onChange={(e) => setQuickRegNum(e.target.value)}
                      className="text-xs"
                    />
                    {provider === "CNOPS" && (
                      <Input
                        placeholder="N° Affiliation CNOPS"
                        value={quickAffiliationNum}
                        onChange={(e) => setQuickAffiliationNum(e.target.value)}
                        className="text-xs"
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={quickInsuredIsPatient}
                        onChange={(e) =>
                          setQuickInsuredIsPatient(e.target.checked)
                        }
                        className="rounded"
                      />
                      <span>Le patient est l’assuré(e)</span>
                    </label>
                    {!quickInsuredIsPatient && (
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Nom de l’assuré(e)"
                          value={quickInsuredName}
                          onChange={(e) => setQuickInsuredName(e.target.value)}
                          className="text-xs w-40"
                        />
                        <Select
                          value={quickInsuredRelationship}
                          onChange={(e) =>
                            setQuickInsuredRelationship(
                              e.target.value as BeneficiaryRelationship,
                            )
                          }
                          className="text-xs"
                        >
                          {beneficiaryRelationships
                            .filter((r) => r !== "LUI_MEME")
                            .map((r) => (
                              <option key={r} value={r}>
                                {relationshipLabels[r]}
                              </option>
                            ))}
                        </Select>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-2.5 text-xs"
                      onClick={handleCreateQuickPolicy}
                      disabled={!quickRegNum.trim()}
                    >
                      Enregistrer cette couverture
                    </Button>
                  </div>
                </div>
              )}

              {/* Purpose selection */}
              <div className="space-y-1.5 pt-2">
                <label className="block text-xs font-semibold">
                  Objet du document
                </label>
                <div className="flex flex-wrap gap-4 text-xs font-medium">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="documentPurpose"
                      value="EXECUTION"
                      checked={documentPurpose === "EXECUTION"}
                      onChange={() => setDocumentPurpose("EXECUTION")}
                      className="text-primary focus:ring-primary"
                    />
                    <span>Exécution des soins (remboursement)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="documentPurpose"
                      value="ENTENTE_PREALABLE"
                      checked={documentPurpose === "ENTENTE_PREALABLE"}
                      onChange={() => setDocumentPurpose("ENTENTE_PREALABLE")}
                      className="text-primary focus:ring-primary"
                    />
                    <span>Entente préalable (accord préalable)</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Provider Specific Settings */}
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">
                2. Spécificités officielles — {provider}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* CNSS */}
              {provider === "CNSS" && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold mb-1.5">
                      Type de soins dentaires (cases à cocher sur la feuille CNSS)
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {cnssCareTypes.map((key) => {
                        const checked = cnssCareTypesSelected.includes(key);
                        return (
                          <label
                            key={key}
                            className={`flex items-center gap-2 rounded-md border p-2.5 cursor-pointer ${
                              checked
                                ? "border-primary bg-primary/5 font-semibold text-primary"
                                : "text-muted-foreground"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCnssCareTypesSelected((prev) => [
                                    ...prev,
                                    key,
                                  ]);
                                } else {
                                  setCnssCareTypesSelected((prev) =>
                                    prev.filter((k) => k !== key),
                                  );
                                }
                              }}
                              className="rounded text-primary"
                            />
                            <span>{cnssCareTypeLabels[key]}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label
                        htmlFor="cnss-auth"
                        className="block font-semibold"
                      >
                        N° d’accord préalable CNSS (le cas échéant)
                      </label>
                      <Input
                        id="cnss-auth"
                        value={cnssPriorAuth}
                        onChange={(e) => setCnssPriorAuth(e.target.value)}
                        placeholder="Ex : AP-2026-99"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="cnss-acc-date"
                        className="block font-semibold"
                      >
                        Date de survenance de l’accident (le cas échéant)
                      </label>
                      <Input
                        id="cnss-acc-date"
                        type="date"
                        value={cnssAccidentDate}
                        onChange={(e) => setCnssAccidentDate(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* CNOPS */}
              {provider === "CNOPS" && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold mb-1.5">
                      Type de soins dentaires (cases à cocher CNOPS)
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {cnopsCareTypes.map((key) => {
                        const checked = cnopsCareTypesSelected.includes(key);
                        return (
                          <label
                            key={key}
                            className={`flex items-center gap-2 rounded-md border p-2.5 cursor-pointer ${
                              checked
                                ? "border-secondary bg-secondary-tint/40 font-semibold text-secondary"
                                : "text-muted-foreground"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCnopsCareTypesSelected((prev) => [
                                    ...prev,
                                    key,
                                  ]);
                                } else {
                                  setCnopsCareTypesSelected((prev) =>
                                    prev.filter((k) => k !== key),
                                  );
                                }
                              }}
                              className="rounded text-secondary"
                            />
                            <span>{cnopsCareTypeLabels[key]}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label htmlFor="cnops-inpe" className="block font-semibold">
                        INPE du médecin dentiste (obligatoire pour le PDF)
                      </label>
                      <Input id="cnops-inpe" inputMode="numeric" value={cnopsInpe}
                        onChange={e => setCnopsInpe(e.target.value)} aria-describedby="cnops-inpe-help" />
                      <p id="cnops-inpe-help" className="text-muted-foreground">
                        Saisissez les neuf chiffres de l’INPE vérifié. L’INP du cabinet n’est pas repris automatiquement.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="cnops-auth"
                        className="block font-semibold"
                      >
                        N° d’accord préalable CNOPS
                      </label>
                      <Input
                        id="cnops-auth"
                        value={cnopsPriorAuth}
                        onChange={(e) => setCnopsPriorAuth(e.target.value)}
                        placeholder="Référence à reporter (8 cases)"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="cnops-cim10"
                        className="block font-semibold"
                      >
                        Code diagnostic CIM-10
                      </label>
                      <Input
                        id="cnops-cim10"
                        value={cnopsCim10}
                        onChange={(e) => setCnopsCim10(e.target.value)}
                        placeholder="Code confirmé : une majuscule et deux chiffres"
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label
                        htmlFor="cnops-acc-date"
                        className="block font-semibold"
                      >
                        Date d’accident (le cas échéant)
                      </label>
                      <Input
                        id="cnops-acc-date"
                        type="date"
                        value={cnopsAccidentDate}
                        onChange={(e) => setCnopsAccidentDate(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="cnops-acc-causes"
                        className="block font-semibold"
                      >
                        Causes de l’accident
                      </label>
                      <Input
                        id="cnops-acc-causes"
                        value={cnopsAccidentCauses}
                        onChange={(e) => setCnopsAccidentCauses(e.target.value)}
                        placeholder="Ex : Choc lors d'une activité sportive"
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* FAR */}
              {provider === "FAR" && (
                <div className="space-y-4 text-xs">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <label htmlFor="far-purpose" className="block font-semibold">
                        Objet sur la feuille FAR
                      </label>
                      <Select
                        id="far-purpose"
                        value={farDentalPurpose}
                        onChange={(e) =>
                          setFarDentalPurpose(
                            e.target.value as FARDentalPurpose,
                          )
                        }
                        className="text-xs"
                      >
                        <option value="">Choisir explicitement</option>
                        {farDentalPurposes.map((p) => (
                          <option key={p} value={p}>
                            {farDentalPurposeLabels[p]}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="far-care-type" className="block font-semibold">
                        Nature des soins
                      </label>
                      <Select
                        id="far-care-type"
                        value={farCareType}
                        onChange={(e) =>
                          setFarCareType(e.target.value as FARCareType)
                        }
                        className="text-xs"
                      >
                        <option value="">Choisir explicitement</option>
                        {farCareTypes.map((t) => (
                          <option key={t} value={t}>
                            {farCareTypeLabels[t]}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="far-context" className="block font-semibold">Contexte</label>
                      <Select
                        id="far-context"
                        value={farCareContext}
                        onChange={(e) =>
                          setFarCareContext(e.target.value as FARCareContext)
                        }
                        className="text-xs"
                      >
                        <option value="">Choisir explicitement</option>
                        {farCareContexts.map((c) => (
                          <option key={c} value={c}>
                            {farCareContextLabels[c]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 font-semibold">INPE du médecin dentiste (FAR)
                      <Input id="far-inpe" inputMode="numeric" value={farInpe} onChange={event => setFarInpe(event.target.value)} />
                    </label>
                    <label className="space-y-1 font-semibold">Nombre de prospectus FAR
                      <Input id="far-prospectus" type="number" min="0" step="1" value={farProspectusCount ?? ""}
                        onChange={event => setFarProspectusCount(event.target.value === "" ? undefined : Number(event.target.value))} />
                    </label>
                  </div>
                  <p className="text-muted-foreground">Saisissez l’INPE vérifié (neuf chiffres) et le décompte réel des prospectus. Aucun numéro n’est repris depuis l’INP du cabinet.</p>
                  <div className="space-y-1">
                    <label htmlFor="far-auth" className="block font-semibold">
                      N° d’accord préalable FAR (si applicable)
                    </label>
                    <Input
                      id="far-auth"
                      value={farPriorAuth}
                      onChange={(e) => setFarPriorAuth(e.target.value)}
                      placeholder="Référence conservée dans le brouillon"
                      className="text-xs sm:w-1/2"
                    />
                    <p className="mt-1 text-muted-foreground">Aucun champ d’accord préalable n’est vérifié sur ce modèle ; cette référence n’est pas imprimée dans les zones réservées à la mutuelle.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Dental Acts Table */}
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <CardTitle className="text-base">
                  3. Actes dentaires à porter sur la feuille de soins
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Les actes doivent être saisis ou confirmés explicitement avec
                  leur cotation officielle.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-8 px-2.5 text-xs"
                onClick={handleAddAct}
              >
                <Plus className="mr-1.5 size-3.5" />
                Ajouter une ligne d’acte
              </Button>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-2 w-28">Date</th>
                      <th className="p-2 w-16">Dent</th>
                      <th className="p-2 min-w-44">Description de l’acte</th>
                      <th className="p-2 w-20">Code</th>
                      <th className="p-2 w-16">Clé</th>
                      <th className="p-2 w-16">Coeff.</th>
                      <th className="p-2 w-24 text-right">Montant (DH)</th>
                      <th className="p-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {acts.map((act, idx) => (
                      <tr key={act.id || idx} className="hover:bg-muted/10">
                        <td className="p-1.5">
                          <Input
                            type="date"
                            value={act.treatmentDate}
                            onChange={(e) =>
                              handleActChange(
                                idx,
                                "treatmentDate",
                                e.target.value,
                              )
                            }
                            className="h-8 text-xs p-1"
                            required
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            placeholder="FDI"
                            value={act.toothReference || ""}
                            onChange={(e) =>
                              handleActChange(
                                idx,
                                "toothReference",
                                e.target.value,
                              )
                            }
                            className="h-8 text-xs p-1"
                            title="Numéro de dent (ex : 16, 21)"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            placeholder="Description de l'acte..."
                            value={act.description}
                            onChange={(e) =>
                              handleActChange(idx, "description", e.target.value)
                            }
                            className="h-8 text-xs p-1"
                            required
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            placeholder="SC12"
                            value={act.actCode || ""}
                            onChange={(e) =>
                              handleActChange(idx, "actCode", e.target.value)
                            }
                            className="h-8 text-xs p-1 font-mono uppercase"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            placeholder="SC"
                            value={act.ngapKeyLetter || ""}
                            onChange={(e) =>
                              handleActChange(
                                idx,
                                "ngapKeyLetter",
                                e.target.value,
                              )
                            }
                            className="h-8 text-xs p-1 font-mono uppercase"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="12"
                            value={act.ngapCoefficient ?? ""}
                            onChange={(e) =>
                              handleActChange(
                                idx,
                                "ngapCoefficient",
                                e.target.value
                                  ? parseFloat(e.target.value)
                                  : undefined,
                              )
                            }
                            className="h-8 text-xs p-1 font-mono"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0.00"
                            value={
                              act.amountMinor === undefined ? "" : minorInput(act.amountMinor).replace(",", ".")
                            }
                            onChange={(e) => {
                              try {
                                const amount = e.target.value === "" ? undefined : parseMinor(e.target.value);
                                handleActChange(idx, "amountMinor", amount);
                                setError(null);
                              } catch {
                                setError("Saisissez des honoraires positifs ou nuls avec deux décimales au maximum.");
                              }
                            }}
                            className="h-8 text-xs p-1 text-right font-medium"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          {acts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveAct(idx)}
                              className="text-muted-foreground hover:text-danger p-1 rounded-sm"
                              title="Supprimer la ligne"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/20 font-semibold">
                    <tr>
                      <td colSpan={6} className="p-2 text-right">
                        Total calculé des honoraires :
                      </td>
                      <td className="p-2 text-right text-primary font-bold">
                        {totalCalculatedMinor === undefined ? "Total hors limite : corrigez les honoraires." : formatMinor(totalCalculatedMinor)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Manual Administrative Fields */}
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">
                4. Renseignements déclaratifs & signature
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <label htmlFor="decl-place" className="block font-semibold">
                    Fait à (Lieu)
                  </label>
                  <Input
                    id="decl-place"
                    value={declarationPlace}
                    onChange={(e) => setDeclarationPlace(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="decl-date" className="block font-semibold">
                    Le (Date de déclaration)
                  </label>
                  <Input
                    id="decl-date"
                    type="date"
                    value={declarationDate}
                    onChange={(e) => setDeclarationDate(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="decl-attach" className="block font-semibold">
                    Nombre de pièces jointes
                  </label>
                  <Input
                    id="decl-attach"
                    type="number"
                    min="0"
                    value={attachmentCount ?? ""}
                    onChange={(e) =>
                      setAttachmentCount(e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="rounded-md border border-border/80 bg-muted/10 p-3 text-muted-foreground">
                <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                  <HelpCircle className="size-3.5 text-secondary" />
                  Zones réservées au praticien ({provider === "CNSS" ? "INP" : "INPE"} / Cachet)
                </p>
                <p>
                  {provider === "FAR"
                    ? "L’INPE FAR saisi est repris dans l’identification du médecin. Les signatures, cachets et zones de contrôle de la mutuelle restent vierges. La partie ordonnance de page 2 est réservée à la rédaction manuelle du médecin."
                    : provider === "CNOPS"
                    ? "L’INPE saisi est repris dans le champ du médecin dentiste. Les INP des autres professionnels restent vides. Les signatures et cachets doivent être apposés manuellement."
                    : "Le numéro INP (084209071) est repris dans le champ du dentiste sur la feuille CNSS. Les signatures et cachets restent vierges et doivent être apposés manuellement."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Clinical Treatment Importer & Document Summary */}
        <div className="space-y-6">
          {/* Clinical Records Importer */}
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Download className="size-4 text-primary" />
                Importer depuis le dossier clinique
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs">
              <p className="text-muted-foreground">
                Sélectionnez un soin clinique réalisé pour copier sa date et sa
                description sans altérer le dossier médical ni deviner de code.
              </p>

              {patientConsultations.length === 0 &&
              (!selectedPatient?.treatments ||
                selectedPatient.treatments.length === 0) ? (
                <p className="italic text-muted-foreground">
                  Aucun historique clinique disponible pour ce patient.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {/* From Consultations */}
                  {patientConsultations.map((c) =>
                    c.treatments.map((t) => {
                      const alreadyImported = selectedTreatmentIds.includes(
                        t.id,
                      );
                      return (
                        <div
                          key={t.id}
                          className={`rounded-md border p-2 text-xs transition-colors ${
                            alreadyImported
                              ? "bg-muted/40 border-border opacity-70"
                              : "bg-surface hover:border-primary/50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div>
                              <p className="font-medium text-foreground">
                                {t.description}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {t.treatmentDate}
                                {t.toothReference
                                  ? ` · Dent ${t.toothReference}`
                                  : ""}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant={alreadyImported ? "ghost" : "outline"}
                              className="h-6 text-[10px] px-2 shrink-0"
                              disabled={alreadyImported}
                              onClick={() =>
                                handleImportTreatment(
                                  c.id,
                                  t.id,
                                  t.description,
                                  t.treatmentDate,
                                  t.toothReference,
                                )
                              }
                            >
                              {alreadyImported ? "Importé" : "Importer"}
                            </Button>
                          </div>
                        </div>
                      );
                    }),
                  )}

                  {/* From Patient Treatment History */}
                  {selectedPatient?.treatments?.map((t) => {
                    const alreadyImported = selectedTreatmentIds.includes(t.id);
                    return (
                      <div
                        key={t.id}
                        className={`rounded-md border p-2 text-xs transition-colors ${
                          alreadyImported
                            ? "bg-muted/40 border-border opacity-70"
                            : "bg-surface hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div>
                            <p className="font-medium text-foreground">
                              {t.treatment}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {t.date} · {formatMinor(t.priceCentimes)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant={alreadyImported ? "ghost" : "outline"}
                            className="h-6 text-[10px] px-2 shrink-0"
                            disabled={alreadyImported}
                            onClick={() =>
                              handleImportTreatment(
                                "",
                                t.id,
                                t.treatment,
                                t.date,
                                "",
                              )
                            }
                          >
                            {alreadyImported ? "Importé" : "Importer"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Document Summary */}
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm font-semibold">
                Synthèse du document
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Bénéficiaire</span>
                <span className="font-semibold text-foreground">
                  {selectedPatient
                    ? `${selectedPatient.identity.firstName} ${selectedPatient.identity.lastName}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Organisme</span>
                <span className="font-bold text-primary">{provider}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Nombre d’actes</span>
                <span className="font-semibold text-foreground">
                  {acts.length}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Total honoraires</span>
                <span className="font-bold text-foreground">
                  {totalCalculatedMinor === undefined ? "Total hors limite : corrigez les honoraires." : formatMinor(totalCalculatedMinor)}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Pièces jointes</span>
                <span className="font-semibold text-foreground">
                  {attachmentCount ?? "Non renseigné"}
                </span>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={() => handleSave("BROUILLON")}
                  disabled={submitting}
                >
                  <Save className="mr-1.5 size-3.5" />
                  Enregistrer brouillon
                </Button>
                <Button
                  type="button"
                  className="w-full text-xs"
                  onClick={() => handleSave("VALIDE")}
                  disabled={submitting}
                >
                  <CheckCircle2 className="mr-1.5 size-3.5" />
                  Valider la feuille de soins
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {provider === "CNSS" && (
        <CnssDentalChart
          acts={acts}
          confirmedTeeth={confirmedTeeth}
          onChange={teeth => setChartSelection({ patientId: selectedPatientId, teeth })}
        />
      )}
      {provider === "CNOPS" && (
        <InsuranceDentalChart config={cnopsChartConfig} acts={acts} confirmedTeeth={cnopsConfirmedTeeth}
          onChange={teeth => setCnopsChartSelection({ patientId: selectedPatientId, teeth })} />
      )}
      {provider === "FAR" && (
        <FarDentalChart acts={acts} marks={farMarks} approved={farMarkingApproved}
          onMarksChange={marks => setFarChartSelection({ patientId: selectedPatientId, marks, approvalBasis: "" })}
          onApprove={approved => setFarChartSelection({ patientId: selectedPatientId, marks: farMarks,
            approvalBasis: approved ? JSON.stringify(acts) : "" })} />
      )}
      {provider === "FAR" && pdfInput && (
        <InsurancePdfActions key={JSON.stringify(pdfInput)} provider="FAR" input={pdfInput} />
      )}
      {provider === "CNOPS" && pdfInput && (
        <InsurancePdfActions key={JSON.stringify(pdfInput)} provider="CNOPS" input={pdfInput} />
      )}
      {provider === "CNSS" && pdfInput && (
        <CnssPdfActions key={JSON.stringify(pdfInput)} input={pdfInput} />
      )}
    </div>
  );
}
