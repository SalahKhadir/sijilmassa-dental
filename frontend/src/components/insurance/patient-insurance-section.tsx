"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Edit2, Trash2, FileText, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { usePatients } from "@/components/patients/patient-provider";
import { useInsurance } from "./insurance-provider";
import { InsurancePolicyDialog } from "./insurance-policy-dialog";
import type {
  InsuranceDocumentDraft,
  PatientInsurancePolicy,
} from "@/lib/insurance/types";
import {
  documentPurposeLabels,
  relationshipLabels,
} from "@/lib/insurance/types";
import { formatMinor } from "@/lib/billing/money";
import { formatPatientDate } from "@/lib/patients/dates";

export function PatientInsuranceSection({ patientId }: { patientId: string }) {
  const { repository: patientsRepo } = usePatients();
  const { repository: insuranceRepo, revision, deletePolicy, deleteDraft } =
    useInsurance();

  const [policies, setPolicies] = useState<PatientInsurancePolicy[]>([]);
  const [drafts, setDrafts] = useState<InsuranceDocumentDraft[]>([]);
  const [patient, setPatient] = useState<
    Awaited<ReturnType<typeof patientsRepo.getById>> | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<
    PatientInsurancePolicy | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [pat, pols, drfs] = await Promise.all([
          patientsRepo.getById(patientId),
          insuranceRepo.getPoliciesByPatientId(patientId),
          insuranceRepo.getDraftsByPatientId(patientId),
        ]);

        if (!cancelled) {
          setPatient(pat ?? null);
          setPolicies(pols);
          setDrafts(drfs);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [patientId, revision, patientsRepo, insuranceRepo]);

  if (loading || !patient || patient.id !== patientId) {
    return null;
  }

  const activePolicy = policies.find((p) => p.active) ?? policies[0];

  const handleDeletePolicy = async (id: string) => {
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir supprimer cette police d'assurance ?",
      )
    ) {
      try { await deletePolicy(id); setError(""); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "La couverture n’a pas pu être supprimée."); }
    }
  };

  const handleDeleteDraft = async (id: string) => {
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir supprimer ce brouillon de feuille de soins ?",
      )
    ) {
      await deleteDraft(id);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <CardTitle>Assurance & Feuilles de soins dentaires</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {activePolicy ? (
              <Button
                variant="outline"
                className="h-8 px-3 text-xs"
                onClick={() => {
                  setEditingPolicy(activePolicy);
                  setIsDialogOpen(true);
                }}
              >
                <Edit2 className="mr-1.5 size-3.5" />
                Modifier la police
              </Button>
            ) : (
              <Button
                className="h-8 px-3 text-xs"
                onClick={() => {
                  setEditingPolicy(undefined);
                  setIsDialogOpen(true);
                }}
              >
                <Plus className="mr-1.5 size-4" />
                Ajouter une couverture
              </Button>
            )}
            <Button asChild variant="secondary" className="h-8 px-3 text-xs">
              <Link
                href={`/documents/assurances/nouvelle?patientId=${patient.id}`}
              >
                <Plus className="mr-1.5 size-4" />
                Nouvelle feuille de soins
              </Link>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {/* Policy Information */}
          {activePolicy ? (
            <div className="rounded-lg border bg-surface p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary tracking-wide">
                    {activePolicy.provider}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {activePolicy.provider === "CNSS" &&
                      "Caisse Nationale de Sécurité Sociale"}
                    {activePolicy.provider === "CNOPS" &&
                      "Caisse Nationale des Organismes de Prévoyance Sociale"}
                    {activePolicy.provider === "FAR" &&
                      "Forces Armées Royales (Mutuelle militaire)"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 text-danger hover:text-danger hover:bg-danger/10"
                    onClick={() => handleDeletePolicy(activePolicy.id)}
                    title="Supprimer la police"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">
                    N° d’immatriculation
                  </p>
                  <p className="mt-0.5 font-semibold text-foreground">
                    {activePolicy.registrationNumber || "Non renseigné"}
                  </p>
                </div>

                {activePolicy.provider === "CNOPS" && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      N° d’affiliation (CNOPS)
                    </p>
                    <p className="mt-0.5 font-semibold text-foreground">
                      {activePolicy.affiliationNumber || "Non renseigné"}
                    </p>
                  </div>
                )}

                {activePolicy.provider === "FAR" && (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        N° de Compte militaire
                      </p>
                      <p className="mt-0.5 font-semibold text-foreground">
                        {activePolicy.militaryAccountNumber || "Non renseigné"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Grade & Unité
                      </p>
                      <p className="mt-0.5 font-semibold text-foreground">
                        {[activePolicy.militaryRank, activePolicy.militaryUnit]
                          .filter(Boolean)
                          .join(" · ") || "Non renseigné"}
                      </p>
                    </div>
                  </>
                )}

                <div>
                  <p className="text-xs text-muted-foreground">
                    Assuré(e) principal(e)
                  </p>
                  <p className="mt-0.5 font-semibold text-foreground">
                    {activePolicy.insuredPerson.firstName}{" "}
                    {activePolicy.insuredPerson.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Lien : {relationshipLabels[activePolicy.insuredPerson.relationship]}
                    {activePolicy.insuredPerson.cin
                      ? ` · CIN : ${activePolicy.insuredPerson.cin}`
                      : ""}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Aucune couverture d’assurance (CNSS, CNOPS ou FAR) enregistrée
                pour ce patient.
              </p>
              <Button
                variant="outline"
                className="mt-3 h-8 px-3 text-xs"
                onClick={() => {
                  setEditingPolicy(undefined);
                  setIsDialogOpen(true);
                }}
              >
                <Plus className="mr-1.5 size-4" />
                Renseigner la couverture
              </Button>
            </div>
          )}

          {/* Drafts List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="size-4 text-muted-foreground" />
                Feuilles de soins préparées ({drafts.length})
              </h4>
            </div>

            {drafts.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Aucun brouillon de feuille de soins créé pour ce patient.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Organisme</th>
                      <th className="px-4 py-2.5">Objet</th>
                      <th className="px-4 py-2.5">Actes</th>
                      <th className="px-4 py-2.5 text-right">Montant</th>
                      <th className="px-4 py-2.5 text-center">Statut</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {drafts.map((draft) => {
                      const totalMinor =
                        draft.manualFields.totalFeesMinor ??
                        draft.acts.reduce(
                          (acc, a) => acc + (a.amountMinor ?? 0),
                          0,
                        );

                      return (
                        <tr key={draft.id} className="hover:bg-muted/10">
                          <td className="px-4 py-3 font-medium whitespace-nowrap">
                            {formatPatientDate(draft.createdAt)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-flex rounded-full bg-secondary-tint/70 px-2 py-0.5 text-xs font-bold text-secondary">
                              {draft.provider}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {documentPurposeLabels[draft.documentPurpose]}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {draft.acts.length} acte
                            {draft.acts.length === 1 ? "" : "s"}
                          </td>
                          <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                            {formatMinor(totalMinor)}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                draft.status === "VALIDE"
                                  ? "bg-success/15 text-success"
                                  : "bg-warning/15 text-warning"
                              }`}
                            >
                              {draft.status === "VALIDE"
                                ? "Validé"
                                : "Brouillon"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <Button asChild variant="ghost" className="h-8 w-8 p-0">
                                <Link
                                  href={`/documents/assurances/${draft.id}`}
                                  title="Consulter ou modifier"
                                >
                                  <ExternalLink className="size-3.5" />
                                  <span className="sr-only">Ouvrir</span>
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                className="h-8 w-8 p-0 text-danger hover:text-danger hover:bg-danger/10"
                                onClick={() => handleDeleteDraft(draft.id)}
                                title="Supprimer ce brouillon"
                              >
                                <Trash2 className="size-3.5" />
                                <span className="sr-only">Supprimer</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <InsurancePolicyDialog
        patient={patient}
        existingPolicy={editingPolicy}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSaved={() => setIsDialogOpen(false)}
      />
    </>
  );
}
