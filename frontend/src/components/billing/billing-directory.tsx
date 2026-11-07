"use client";
import Link from "next/link";
import { useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { financialSummary } from "@/lib/billing/calculations";
import { filterInvoices, type BillingQuery } from "@/lib/billing/selectors";
import { invoiceStatuses } from "@/lib/billing/types";
import { useBillingData } from "./use-billing-data";
import {
  BillingErrorState,
  BillingLoading,
  BillingNotice,
  InvoiceMissing,
} from "./billing-states";
import { FinancialSummary } from "./financial-summary";
import { InvoiceList } from "./invoice-list";
export function BillingDirectory({ patientId = "" }: { patientId?: string }) {
  const { state, retry } = useBillingData();
  const [query, setQuery] = useState<BillingQuery>({
    search: "",
    status: "all",
    from: "",
    to: "",
    sort: "newest",
    patientId,
  });
  const [page, setPage] = useState(1);
  function change(patch: Partial<BillingQuery>) {
    setQuery((value) => ({ ...value, ...patch }));
    setPage(1);
  }
  if (state.status === "loading") return <BillingLoading />;
  if (state.status === "error") return <BillingErrorState retry={retry} />;
  const { invoices, payments, patients } = state.data;
  if (patientId && !patients.some((patient) => patient.id === patientId))
    return <InvoiceMissing message="Ce patient est introuvable." />;
  const invalidRange = Boolean(query.from && query.to && query.from > query.to);
  const filtered = invalidRange
    ? []
    : filterInvoices(invoices, payments, patients, { ...query, patientId });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pageCount);
  const scope = invoices.filter(
    (invoice) => !patientId || invoice.patientId === patientId,
  );
  return (
    <>
      <PageHeading
        eyebrow="Gestion financière du cabinet"
        title="Facturation"
        description="Gérez les factures et les règlements du cabinet."
      >
        <Button asChild>
          <Link
            href={`/facturation/nouvelle${patientId ? `?patientId=${patientId}` : ""}`}
          >
            Nouvelle facture
          </Link>
        </Button>
      </PageHeading>
      <BillingNotice />
      <FinancialSummary summary={financialSummary(scope, payments)} />
      <p className="text-xs text-muted-foreground">
        {patientId
          ? "Indicateurs du patient sélectionné."
          : "Indicateurs de tous les patients."}{" "}
        Les filtres ci-dessous portent sur la liste.
      </p>
      {patientId && (
        <p className="text-sm text-muted-foreground">
          Factures du patient sélectionné ·{" "}
          <Link className="text-primary underline" href="/facturation">
            Tous les patients
          </Link>
        </p>
      )}
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <label
                htmlFor="invoice-search"
                className="block text-sm font-semibold"
              >
                Rechercher une facture ou un patient
              </label>
              <Input
                id="invoice-search"
                value={query.search}
                onChange={(event) => change({ search: event.target.value })}
                placeholder="Numéro, nom ou référence patient"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="invoice-filter"
                className="block text-sm font-semibold"
              >
                Statut
              </label>
              <Select
                id="invoice-filter"
                value={query.status}
                onChange={(event) =>
                  change({
                    status: event.target.value as BillingQuery["status"],
                  })
                }
              >
                <option value="all">Tous les statuts</option>
                {Object.entries(invoiceStatuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="invoice-sort"
                className="block text-sm font-semibold"
              >
                Trier les factures
              </label>
              <Select
                id="invoice-sort"
                value={query.sort}
                onChange={(event) =>
                  change({ sort: event.target.value as BillingQuery["sort"] })
                }
              >
                <option value="newest">Date · Plus récentes</option>
                <option value="oldest">Date · Plus anciennes</option>
                <option value="highest">Total · Plus élevé</option>
                <option value="lowest">Total · Plus faible</option>
              </Select>
            </div>
            {(
              [
                { key: "from", label: "Du" },
                { key: "to", label: "Au" },
              ] as const
            ).map((field) => (
              <div key={field.key} className="space-y-2">
                <label
                  htmlFor={`invoice-${field.key}`}
                  className="block text-sm font-semibold"
                >
                  {field.label}
                </label>
                <Input
                  id={`invoice-${field.key}`}
                  type="date"
                  value={query[field.key]}
                  onChange={(event) =>
                    change({ [field.key]: event.target.value })
                  }
                  aria-invalid={invalidRange}
                  aria-describedby={
                    invalidRange ? "invoice-range-error" : undefined
                  }
                />
              </div>
            ))}
            <Button
              className="self-end"
              variant="ghost"
              onClick={() =>
                change({
                  search: "",
                  status: "all",
                  from: "",
                  to: "",
                  sort: "newest",
                })
              }
            >
              Réinitialiser les filtres
            </Button>
          </div>
          {invalidRange && (
            <p
              role="alert"
              id="invoice-range-error"
              className="text-sm text-danger"
            >
              La date de fin doit suivre la date de début.
            </p>
          )}
          <p role="status" className="text-sm text-muted-foreground">
            {filtered.length} facture{filtered.length === 1 ? "" : "s"} affichée
            {filtered.length === 1 ? "" : "s"}
          </p>
          <InvoiceList
            invoices={filtered.slice((current - 1) * 10, current * 10)}
            payments={payments}
            patients={patients}
          />
          <nav
            aria-label="Pagination des factures"
            className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
          >
            <span className="text-sm text-muted-foreground">
              Page {current} sur {pageCount}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
              >
                Précédent
              </Button>
              <Button
                variant="outline"
                disabled={current >= pageCount}
                onClick={() => setPage(current + 1)}
              >
                Suivant
              </Button>
            </div>
          </nav>
        </CardContent>
      </Card>
    </>
  );
}
