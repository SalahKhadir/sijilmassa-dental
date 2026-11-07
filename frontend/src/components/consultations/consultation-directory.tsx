"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { consultationDirectory } from "@/lib/consultations/selectors";
import type { ConsultationStatus } from "@/lib/consultations/types";
import { useClinicalData } from "./use-clinical-data";
import { ConsultationList } from "./consultation-list";
import {
  ClinicalError,
  ClinicalLoading,
  ClinicalMissing,
  ClinicalNotice,
} from "./clinical-states";
export function ConsultationDirectory({
  patientId = "",
}: {
  patientId?: string;
}) {
  const { state, retry } = useClinicalData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ConsultationStatus>("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  if (state.status === "loading") return <ClinicalLoading />;
  if (state.status === "error") return <ClinicalError retry={retry} />;
  const { consultations, patients } = state.data;
  const patient = patients.find((record) => record.id === patientId);
  if (patientId && !patient)
    return <ClinicalMissing message="Ce patient est introuvable." />;
  const records = consultationDirectory(consultations, patients, {
    search,
    status,
    sort,
    patientId,
  });
  const scoped = consultations.filter(
    (record) => !patientId || record.patientId === patientId,
  );
  return (
    <>
      <PageHeading
        eyebrow="Espace clinique du dentiste"
        title="Consultations"
        description="Suivez les consultations et les soins de vos patients."
      >
        <Button asChild>
          <Link
            href={`/consultations/nouveau${patient ? `?patientId=${patient.id}` : ""}`}
          >
            <Plus aria-hidden="true" />
            Nouvelle consultation
          </Link>
        </Button>
      </PageHeading>
      <ClinicalNotice />
      {patient && (
        <p className="text-sm">
          Consultations de {patient.identity.firstName}{" "}
          {patient.identity.lastName} ·{" "}
          <Link
            className="text-primary underline"
            href={`/patients/${patient.id}/clinique`}
          >
            Retour à la vue clinique
          </Link>{" "}
          ·{" "}
          <Link className="text-primary underline" href="/consultations">
            Tous les patients
          </Link>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Total", scoped.length],
          [
            "Brouillons",
            scoped.filter((item) => item.status === "BROUILLON").length,
          ],
          [
            "Terminées",
            scoped.filter((item) => item.status === "TERMINEE").length,
          ],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="grid gap-5 pt-6 md:grid-cols-[2fr_1fr_1fr]">
          <div className="space-y-2">
            <label htmlFor="clinical-search" className="text-sm font-semibold">
              Rechercher un patient
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute top-3 left-3 size-4 text-muted-foreground"
              />
              <Input
                id="clinical-search"
                className="pl-10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom ou référence patient"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="clinical-status" className="text-sm font-semibold">
              Statut
            </label>
            <Select
              id="clinical-status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
            >
              <option value="all">Tous les statuts</option>
              <option value="BROUILLON">Brouillons</option>
              <option value="TERMINEE">Terminées</option>
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor="clinical-sort" className="text-sm font-semibold">
              Trier par date
            </label>
            <Select
              id="clinical-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
            >
              <option value="newest">Plus récentes</option>
              <option value="oldest">Plus anciennes</option>
            </Select>
          </div>
        </CardContent>
      </Card>
      <p role="status" className="text-sm text-muted-foreground">
        {records.length} consultation{records.length === 1 ? "" : "s"} affichée
        {records.length === 1 ? "" : "s"}
      </p>
      <ConsultationList records={records} patients={patients} />
    </>
  );
}
