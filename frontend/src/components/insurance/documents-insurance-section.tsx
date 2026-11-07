"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ExternalLink, FileSpreadsheet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useInsurance } from "./insurance-provider";
import { usePatients } from "@/components/patients/patient-provider";
import type { InsuranceDocumentDraft } from "@/lib/insurance/types";
import { documentPurposeLabels } from "@/lib/insurance/types";
import { formatMinor } from "@/lib/billing/money";
import { formatPatientDate } from "@/lib/patients/dates";

export function DocumentsInsuranceSection({
  patientId,
}: {
  patientId?: string;
}) {
  const { repository: insuranceRepo, revision } = useInsurance();
  const { repository: patientsRepo } = usePatients();

  const [drafts, setDrafts] = useState<InsuranceDocumentDraft[]>([]);
  const [patientsMap, setPatientsMap] = useState<
    Map<string, { name: string; reference: string }>
  >(new Map());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [allDrafts, allPatients] = await Promise.all([
          patientId
            ? insuranceRepo.getDraftsByPatientId(patientId)
            : insuranceRepo.listDrafts(),
          patientsRepo.list(),
        ]);

        if (!cancelled) {
          setDrafts(allDrafts);
          const map = new Map<string, { name: string; reference: string }>();
          allPatients.forEach((p) => {
            map.set(p.id, {
              name: `${p.identity.firstName} ${p.identity.lastName}`,
              reference: p.reference,
            });
          });
          setPatientsMap(map);
        }
      } catch {
        // Fallback gracefully
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [patientId, revision, insuranceRepo, patientsRepo]);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-primary" />
          <CardTitle>Feuilles de soins dentaires (CNSS, CNOPS, FAR)</CardTitle>
        </div>
        <Button asChild className="h-9 text-xs">
          <Link
            href={`/documents/assurances/nouvelle${patientId ? `?patientId=${patientId}` : ""}`}
          >
            <Plus className="mr-1.5 size-4" />
            Nouvelle feuille de soins
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4 bg-surface">
            <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              CNSS
            </span>
            <p className="mt-2 text-sm font-semibold text-foreground">
              Feuille de soins dentaires
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Soins (600), Prothèse (626), ODF (650), Autres (675).
            </p>
          </div>

          <div className="rounded-lg border p-4 bg-surface">
            <span className="inline-flex rounded-full bg-secondary-tint px-2.5 py-0.5 text-xs font-bold text-secondary">
              CNOPS
            </span>
            <p className="mt-2 text-sm font-semibold text-foreground">
              Feuille de soins dentaires
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Immatriculation, Affiliation CNOPS, CIM-10, Soins & Prothèse.
            </p>
          </div>

          <div className="rounded-lg border p-4 bg-surface">
            <span className="inline-flex rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-bold text-foreground">
              FAR
            </span>
            <p className="mt-2 text-sm font-semibold text-foreground">
              Mutuelle militaire / soins
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Devis / Reçus, N° Compte, Grade, Unité, Soins & Prothèse.
            </p>
          </div>
        </div>

        {/* Drafts table */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Dossiers d’assurance préparés ({drafts.length})
          </h4>

          {drafts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Aucune feuille de soins enregistrée pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    {!patientId && <th className="px-4 py-2.5">Patient</th>}
                    <th className="px-4 py-2.5">Organisme</th>
                    <th className="px-4 py-2.5">Objet</th>
                    <th className="px-4 py-2.5">Actes</th>
                    <th className="px-4 py-2.5 text-right">Montant</th>
                    <th className="px-4 py-2.5 text-center">Statut</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {drafts.map((draft) => {
                    const pat = patientsMap.get(draft.patientId);
                    const totalMinor =
                      draft.manualFields.totalFeesMinor ??
                      draft.acts.reduce(
                        (acc, a) => acc + (a.amountMinor ?? 0),
                        0,
                      );

                    return (
                      <tr key={draft.id} className="hover:bg-muted/10">
                        <td className="px-4 py-3 font-medium whitespace-nowrap text-xs">
                          {formatPatientDate(draft.createdAt)}
                        </td>
                        {!patientId && (
                          <td className="px-4 py-3 whitespace-nowrap text-xs">
                            <span className="font-semibold text-foreground">
                              {pat?.name || "Patient inconnu"}
                            </span>
                            {pat?.reference && (
                              <span className="text-muted-foreground ml-1">
                                ({pat.reference})
                              </span>
                            )}
                          </td>
                        )}
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
                        <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-xs">
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
                          <Button asChild variant="ghost" className="h-8 text-xs">
                            <Link href={`/documents/assurances/${draft.id}`}>
                              <ExternalLink className="mr-1 size-3.5" />
                              Ouvrir
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-5">
          Fondation des données d’assurance et vérification des gabarits
          officiels (Phase 9.1). Le remplissage automatique direct sur les
          formulaires originaux sera disponible dans une phase ultérieure.
        </p>
      </CardContent>
    </Card>
  );
}
