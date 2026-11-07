import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import type { Patient } from "@/lib/patients/types";
import {
  filterAndSortPatients,
  paginatePatients,
  type PatientDirectoryQuery,
} from "@/lib/patients/directory";
import type { PatientQueryState } from "./use-patient-query";
import { PatientLoading, PatientError } from "./patient-states";
import { patientDirectoryEntry } from "@/lib/patients/privacy";
import { PatientTable } from "./patient-table";

export function PatientDirectoryResults({
  state,
  query,
  retry,
  changePage,
  clearFilters,
}: {
  state: PatientQueryState<Patient[]>;
  query: PatientDirectoryQuery;
  retry: () => void;
  changePage: (page: number) => void;
  clearFilters: () => void;
}) {
  if (state.status === "loading") return <PatientLoading />;
  if (state.status === "error") return <PatientError retry={retry} />;
  const filtered = filterAndSortPatients(state.data, query);
  const pagination = paginatePatients(filtered, query.page, query.pageSize);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <h2 className="text-sm font-semibold">Annuaire des patients</h2>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-xs text-muted-foreground"
        >
          {pagination.total} patient{pagination.total > 1 ? "s" : ""} trouvé
          {pagination.total > 1 ? "s" : ""}
        </p>
      </div>
      {state.data.length === 0 ? (
        <EmptyState
          title="Aucun patient pour le moment"
          description="Utilisez « Nouveau patient » pour créer un premier dossier fictif en mémoire."
        />
      ) : filtered.length === 0 ? (
        <>
          <EmptyState
            title="Aucun résultat"
            description="Essayez un autre nom, une référence ou un téléphone, ou réinitialisez les filtres."
          />
          <div className="flex justify-center pb-6">
            <Button variant="outline" onClick={clearFilters}>
              Réinitialiser les filtres
            </Button>
          </div>
        </>
      ) : (
        <>
          <PatientTable
            patients={pagination.items.map(patientDirectoryEntry)}
          />
          <nav
            aria-label="Pagination des patients"
            className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"
          >
            <p className="text-xs text-muted-foreground">
              {pagination.first}–{pagination.last} sur {pagination.total}{" "}
              patients · Page {pagination.page} sur {pagination.pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={pagination.page === 1}
                onClick={() => changePage(pagination.page - 1)}
              >
                Précédent
              </Button>
              <Button
                variant="outline"
                disabled={pagination.page === pagination.pageCount}
                onClick={() => changePage(pagination.page + 1)}
              >
                Suivant
              </Button>
            </div>
          </nav>
        </>
      )}
    </Card>
  );
}
