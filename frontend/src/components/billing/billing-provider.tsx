"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  billableServiceFixtures,
  invoiceFixtures,
  paymentFixtures,
} from "@/data/billing";
import { createInMemoryBillingRepositories } from "@/lib/billing/repository";
import type {
  BillingRepositories,
  Invoice,
  InvoiceInput,
  PaymentInput,
} from "@/lib/billing/types";
import { usePatients } from "@/components/patients/patient-provider";
import { useConsultations } from "@/components/consultations/consultation-provider";
interface BillingContextValue {
  repositories: BillingRepositories;
  revision: number;
  feedback: { id: string; message: string } | null;
  clearFeedback(): void;
  create(input: InvoiceInput): Promise<Invoice>;
  updateDraft(id: string, input: InvoiceInput): Promise<Invoice>;
  issue(id: string): Promise<Invoice>;
  cancel(id: string, reason: string): Promise<Invoice>;
  pay(input: PaymentInput): Promise<void>;
}
const Context = createContext<BillingContextValue | null>(null);
export function BillingProvider({ children }: { children: ReactNode }) {
  const { repository: patients } = usePatients();
  const { repository: consultations } = useConsultations();
  const [repositories] = useState(() =>
    createInMemoryBillingRepositories(
      {
        invoices: invoiceFixtures,
        payments: paymentFixtures,
        services: billableServiceFixtures,
      },
      patients,
      consultations,
    ),
  );
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] =
    useState<BillingContextValue["feedback"]>(null);
  const clearFeedback = useCallback(() => setFeedback(null), []);
  const changed = useCallback((invoice: Invoice, action: string) => {
    setRevision((value) => value + 1);
    setFeedback({
      id: invoice.id,
      message: `Facture ${action}. Les changements restent dans cet onglet jusqu’au rechargement.`,
    });
    return invoice;
  }, []);
  const create = useCallback(
    async (input: InvoiceInput) =>
      changed(
        await repositories.invoices.create(input),
        "enregistrée en brouillon",
      ),
    [repositories, changed],
  );
  const updateDraft = useCallback(
    async (id: string, input: InvoiceInput) =>
      changed(await repositories.invoices.updateDraft(id, input), "modifiée"),
    [repositories, changed],
  );
  const issue = useCallback(
    async (id: string) =>
      changed(await repositories.invoices.issue(id), "émise"),
    [repositories, changed],
  );
  const cancel = useCallback(
    async (id: string, reason: string) =>
      changed(await repositories.invoices.cancel(id, reason), "annulée"),
    [repositories, changed],
  );
  const pay = useCallback(
    async (input: PaymentInput) => {
      await repositories.payments.create(input);
      setRevision((value) => value + 1);
      setFeedback({
        id: input.invoiceId,
        message:
          "Règlement enregistré en mémoire. Les changements restent dans cet onglet jusqu’au rechargement.",
      });
    },
    [repositories],
  );
  const value = useMemo(
    () => ({
      repositories,
      revision,
      feedback,
      clearFeedback,
      create,
      updateDraft,
      issue,
      cancel,
      pay,
    }),
    [
      repositories,
      revision,
      feedback,
      clearFeedback,
      create,
      updateDraft,
      issue,
      cancel,
      pay,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useBilling() {
  const value = useContext(Context);
  if (!value) throw new Error("BillingProvider is required.");
  return value;
}
