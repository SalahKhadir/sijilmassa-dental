"use client";
import Link from "next/link";
import { useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { filterPrescriptions } from "@/lib/prescriptions/selectors";
import type { PrescriptionStatus } from "@/lib/prescriptions/types";
import { usePrescriptionData } from "./use-prescription-data";
import { PrescriptionList } from "./prescription-list";
import {
  PrescriptionErrorState,
  PrescriptionLoading,
  PrescriptionMissing,
  PrescriptionNotice,
} from "./prescription-states";
import { DocumentsInsuranceSection } from "@/components/insurance/documents-insurance-section";
export function DocumentsPage({ patientId = "" }: { patientId?: string }) {
  const { state, retry } = usePrescriptionData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | PrescriptionStatus>("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  if (state.status === "loading") return <PrescriptionLoading />;
  if (state.status === "error") return <PrescriptionErrorState retry={retry} />;
  const { prescriptions, patients } = state.data;
  const patient = patients.find((person) => person.id === patientId);
  if (patientId && !patient)
    return <PrescriptionMissing message="Ce patient est introuvable." />;
  const invalidRange = Boolean(from && to && from > to);
  const records = invalidRange
    ? []
    : filterPrescriptions(prescriptions, patients, {
        search,
        status,
        from,
        to,
        sort,
        patientId,
      });
  return (
    <>
      <PageHeading
        eyebrow="Documents du cabinet"
        title="Documents"
        description="Retrouvez les ordonnances et préparez leur impression."
      >
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/documents/ordonnance-vierge">
              Imprimer une ordonnance vierge
            </Link>
          </Button>
          <Button asChild>
            <Link
              href={`/documents/ordonnances/nouvelle${patient ? `?patientId=${patient.id}` : ""}`}
            >
              Nouvelle ordonnance
            </Link>
          </Button>
        </div>
      </PageHeading>
      <PrescriptionNotice />
      {patient && (
        <p className="text-sm">
          Ordonnances de {patient.name} ·{" "}
          <Link className="text-primary underline" href="/documents">
            Tous les patients
          </Link>
        </p>
      )}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Ordonnances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <label
                htmlFor="prescription-search"
                className="block text-sm font-semibold"
              >
                Rechercher un patient
              </label>
              <Input
                id="prescription-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom, référence ou téléphone"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="prescription-status"
                className="block text-sm font-semibold"
              >
                Statut
              </label>
              <Select
                id="prescription-status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as typeof status)
                }
              >
                <option value="all">Tous les statuts</option>
                <option value="BROUILLON">Brouillons</option>
                <option value="FINALISEE">Finalisées</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="prescription-sort"
                className="block text-sm font-semibold"
              >
                Trier par date
              </label>
              <Select
                id="prescription-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
              >
                <option value="newest">Plus récentes</option>
                <option value="oldest">Plus anciennes</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="prescription-from"
                className="block text-sm font-semibold"
              >
                Du
              </label>
              <Input
                id="prescription-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                aria-invalid={invalidRange}
                aria-describedby={
                  invalidRange ? "prescription-range-error" : undefined
                }
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="prescription-to"
                className="block text-sm font-semibold"
              >
                Au
              </label>
              <Input
                id="prescription-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                aria-invalid={invalidRange}
                aria-describedby={
                  invalidRange ? "prescription-range-error" : undefined
                }
              />
            </div>
            <Button
              variant="ghost"
              className="self-end"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setSort("newest");
                setFrom("");
                setTo("");
              }}
            >
              Réinitialiser les filtres
            </Button>
          </div>
          {invalidRange && (
            <p
              role="alert"
              id="prescription-range-error"
              className="text-sm text-danger"
            >
              La date de fin doit suivre la date de début.
            </p>
          )}
          <p role="status" className="text-sm text-muted-foreground">
            {records.length} ordonnance{records.length === 1 ? "" : "s"}{" "}
            affichée{records.length === 1 ? "" : "s"}
          </p>
          <PrescriptionList records={records} patients={patients} />
        </CardContent>
      </Card>
      <DocumentsInsuranceSection patientId={patientId} />
    </>
  );
}
