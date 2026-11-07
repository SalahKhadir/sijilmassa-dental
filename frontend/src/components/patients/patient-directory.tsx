"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Search, X, UserPlus } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { usePatients } from "./patient-provider";
import { usePatientQuery } from "./use-patient-query";
import { PatientIndicators } from "./patient-indicators";
import { PatientDemoNotice } from "./patient-states";
import { PatientDirectoryResults } from "./patient-directory-results";
import type { PatientDirectoryQuery } from "@/lib/patients/directory";

const defaultQuery: PatientDirectoryQuery = {
  search: "",
  status: "all",
  sort: "name",
  page: 1,
  pageSize: 10,
};
export function PatientDirectory() {
  const { repository, revision, today } = usePatients();
  const read = useCallback(() => repository.list(), [repository]);
  const { state, retry } = usePatientQuery(read, revision);
  const [query, setQuery] = useState(defaultQuery);
  const searchInput = useRef<HTMLInputElement>(null);
  function changeQuery(change: Partial<PatientDirectoryQuery>) {
    setQuery((current) => ({ ...current, ...change, page: 1 }));
  }
  return (
    <>
      <PageHeading
        eyebrow="Administration du cabinet"
        title="Patients"
        description="Gérez les dossiers administratifs de vos patients."
      >
        <Button asChild>
          <Link href="/patients/nouveau">
            <UserPlus aria-hidden="true" />
            Nouveau patient
          </Link>
        </Button>
      </PageHeading>
      <PatientDemoNotice />
      {state.status === "ready" && (
        <>
          <PatientIndicators patients={state.data} today={today} />
          <p className="text-xs text-muted-foreground">
            Les rendez-vous à venir proviennent de l’agenda partagé fictif.
          </p>
        </>
      )}
      <section
        aria-label="Recherche et filtres"
        className="grid items-end gap-4 rounded-xl border bg-surface p-5 md:grid-cols-[minmax(0,1fr)_180px_200px]"
      >
        <div className="space-y-2">
          <label htmlFor="patient-search" className="text-xs font-semibold">
            Rechercher un patient
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute top-4 left-3 size-4 text-muted-foreground"
            />
            <Input
              ref={searchInput}
              id="patient-search"
              type="search"
              value={query.search}
              onChange={(event) => changeQuery({ search: event.target.value })}
              placeholder="Nom, prénom, référence, téléphone…"
              className="pr-12 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
            />
            <Button
              variant="ghost"
              className="absolute top-1 right-1 min-h-10 px-2"
              onClick={() => {
                changeQuery({ search: "" });
                searchInput.current?.focus();
              }}
              disabled={!query.search}
              aria-label="Effacer la recherche"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="patient-status" className="text-xs font-semibold">
            Statut administratif
          </label>
          <Select
            id="patient-status"
            value={query.status}
            onChange={(event) =>
              changeQuery({
                status: event.target.value as PatientDirectoryQuery["status"],
              })
            }
          >
            <option value="all">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </Select>
        </div>
        <div className="space-y-2">
          <label htmlFor="patient-sort" className="text-xs font-semibold">
            Trier les patients
          </label>
          <Select
            id="patient-sort"
            value={query.sort}
            onChange={(event) =>
              changeQuery({
                sort: event.target.value as PatientDirectoryQuery["sort"],
              })
            }
          >
            <option value="name">Nom · A à Z</option>
            <option value="newest">Plus récents d’abord</option>
            <option value="oldest">Plus anciens d’abord</option>
          </Select>
        </div>
      </section>
      <PatientDirectoryResults
        state={state}
        query={query}
        retry={retry}
        changePage={(page) => setQuery((current) => ({ ...current, page }))}
        clearFilters={() => setQuery(defaultQuery)}
      />
    </>
  );
}
