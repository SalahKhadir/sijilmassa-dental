import type { PatientRepository } from "../patients/types.ts";
import type { ConsultationRepository } from "../consultations/types.ts";
import type {
  BillableService,
  BillingRepositories,
  Invoice,
  InvoiceInput,
  Payment,
} from "./types.ts";
import {
  invoiceSchema,
  issuedInvoiceSchema,
  paymentSchema,
  cancellationSchema,
} from "./schema.ts";
import { BillingError, lineTotal } from "./money.ts";
import { financialSummary, validatePaymentAmount } from "./calculations.ts";
import { nextInvoiceNumber } from "./numbering.ts";
export function createInMemoryBillingRepositories(
  seed: {
    invoices: readonly Invoice[];
    payments: readonly Payment[];
    services: readonly BillableService[];
  },
  patients: PatientRepository,
  consultations: ConsultationRepository,
  clock: () => Date = () => new Date(),
): BillingRepositories {
  const invoices = new Map(
    seed.invoices.map((record) => [record.id, structuredClone(record)]),
  );
  const payments = new Map(
    seed.payments.map((record) => [record.id, structuredClone(record)]),
  );
  const services = new Map(
    seed.services.map((record) => [record.id, structuredClone(record)]),
  );
  const sequences = new Map(
    seed.invoices.map((record) => [
      record.id,
      Math.max(
        0,
        ...record.lines.map((line) => Number(line.id.split("-line-")[1]) || 0),
      ),
    ]),
  );
  function existing(id: string) {
    const record = invoices.get(id);
    if (!record) throw new BillingError("Cette facture est introuvable.");
    return record;
  }
  function editable(id: string) {
    const record = existing(id);
    if (record.lifecycle !== "BROUILLON")
      throw new BillingError("Cette facture est en lecture seule.");
    return record;
  }
  async function references(input: InvoiceInput) {
    const [patient, consultation] = await Promise.all([
      patients.getById(input.patientId),
      input.consultationId
        ? consultations.getById(input.consultationId)
        : Promise.resolve(undefined),
    ]);
    if (!patient)
      throw new BillingError("Ce patient est introuvable.", "patientId");
    if (
      input.consultationId &&
      (!consultation || consultation.patientId !== input.patientId)
    )
      throw new BillingError(
        "La consultation doit appartenir au patient sélectionné.",
        "consultationId",
      );
    for (const line of input.lines) {
      if (line.serviceId && !services.has(line.serviceId))
        throw new BillingError(
          "Cette prestation de catalogue est introuvable. Utilisez une ligne personnalisée.",
        );
      if (
        line.sourceTreatmentId &&
        !consultation?.treatments.some(
          (treatment) => treatment.id === line.sourceTreatmentId,
        )
      )
        throw new BillingError(
          "Le soin lié doit appartenir à la consultation sélectionnée.",
        );
    }
    return {
      name: `${patient.identity.firstName} ${patient.identity.lastName}`,
      reference: patient.reference,
    };
  }
  function uniqueTreatments(input: InvoiceInput, excludeId?: string) {
    const ids = input.lines
      .map((line) => line.sourceTreatmentId)
      .filter(Boolean);
    if (
      new Set(ids).size !== ids.length ||
      Array.from(invoices.values()).some(
        (invoice) =>
          invoice.id !== excludeId &&
          invoice.lifecycle !== "ANNULEE" &&
          invoice.lines.some((line) => ids.includes(line.sourceTreatmentId)),
      )
    )
      throw new BillingError(
        "Un soin lié figure déjà sur une facture active ou un autre brouillon. Vérifiez les factures existantes.",
      );
  }
  function storeDraft(
    input: InvoiceInput,
    id: string,
    previous?: Invoice,
  ): Invoice {
    uniqueTreatments(input, id);
    if (
      input.lines.some(
        (line) => line.id && !previous?.lines.some((old) => old.id === line.id),
      )
    )
      throw new BillingError("Une référence de ligne est invalide.");
    let sequence = sequences.get(id) ?? 0;
    const lines = input.lines.map((line) => ({
      ...line,
      id: line.id ?? `${id}-line-${++sequence}`,
      lineTotalMinor: lineTotal(line.quantity, line.unitPriceMinor),
    }));
    const timestamp = clock().toISOString();
    const record: Invoice = {
      ...input,
      id,
      invoiceNumber: "",
      lines,
      lifecycle: "BROUILLON",
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    sequences.set(id, sequence);
    invoices.set(id, record);
    return structuredClone(record);
  }
  const allPayments = () => Array.from(payments.values());
  return {
    services: {
      async list() {
        return structuredClone(Array.from(services.values()));
      },
      async getById(id) {
        const record = services.get(id);
        return record ? structuredClone(record) : undefined;
      },
    },
    invoices: {
      async list() {
        return structuredClone(Array.from(invoices.values()));
      },
      async getById(id) {
        const record = invoices.get(id);
        return record ? structuredClone(record) : undefined;
      },
      async create(input) {
        const parsed = invoiceSchema.parse(input);
        await references(parsed);
        const sequence =
          Math.max(
            0,
            ...Array.from(invoices.keys(), (id) =>
              Number(/^invoice-demo-(\d+)$/.exec(id)?.[1] ?? 0),
            ),
          ) + 1;
        return storeDraft(
          parsed,
          `invoice-demo-${String(sequence).padStart(3, "0")}`,
        );
      },
      async updateDraft(id, input) {
        editable(id);
        const parsed = invoiceSchema.parse(input);
        await references(parsed);
        const previous = editable(id);
        if (previous.patientId !== parsed.patientId)
          throw new BillingError(
            "Le patient d’une facture enregistrée doit être conservé.",
            "patientId",
          );
        return storeDraft(parsed, id, previous);
      },
      async issue(id) {
        const snapshot = structuredClone(editable(id));
        issuedInvoiceSchema.parse(snapshot);
        const issuedPatient = await references(snapshot);
        const current = editable(id);
        if (JSON.stringify(snapshot) !== JSON.stringify(current))
          throw new BillingError(
            "Le brouillon a changé. Relisez-le avant de l’émettre.",
          );
        uniqueTreatments(current, id);
        const timestamp = clock().toISOString();
        const record: Invoice = {
          ...current,
          lifecycle: "EMISE",
          invoiceNumber: nextInvoiceNumber(
            current.issueDate,
            Array.from(invoices.values()),
          ),
          issuedPatient,
          finalizedAt: timestamp,
          updatedAt: timestamp,
        };
        financialSummary(
          Array.from(invoices.values()).map((invoice) =>
            invoice.id === id ? record : invoice,
          ),
          allPayments(),
        );
        invoices.set(id, record);
        return structuredClone(record);
      },
      async cancel(id, reason) {
        const cancellationReason = cancellationSchema.parse(reason);
        const current = existing(id);
        if (current.lifecycle !== "EMISE")
          throw new BillingError("Seule une facture émise peut être annulée.");
        if (allPayments().some((payment) => payment.invoiceId === id))
          throw new BillingError(
            "Cette facture contient des règlements. Une correction comptable contrôlée sera nécessaire.",
          );
        const timestamp = clock().toISOString();
        const record: Invoice = {
          ...current,
          lifecycle: "ANNULEE",
          cancelledAt: timestamp,
          cancellationReason,
          updatedAt: timestamp,
        };
        invoices.set(id, record);
        return structuredClone(record);
      },
    },
    payments: {
      async list() {
        return structuredClone(allPayments());
      },
      async create(input) {
        const parsed = paymentSchema.parse(input);
        const previous = allPayments().find(
          (payment) => payment.operationId === parsed.operationId,
        );
        if (previous) {
          if (
            !Object.entries(parsed).every(
              ([key, value]) => previous[key as keyof typeof parsed] === value,
            )
          )
            throw new BillingError(
              "Cette demande de règlement a déjà été utilisée avec un autre contenu.",
            );
          return structuredClone(previous);
        }
        const invoice = existing(parsed.invoiceId);
        validatePaymentAmount(invoice, allPayments(), parsed.amountMinor);
        const sequence =
          Math.max(
            0,
            ...Array.from(payments.keys(), (id) =>
              Number(/^payment-demo-(\d+)$/.exec(id)?.[1] ?? 0),
            ),
          ) + 1;
        const record: Payment = {
          ...parsed,
          id: `payment-demo-${String(sequence).padStart(3, "0")}`,
          patientId: invoice.patientId,
          createdAt: clock().toISOString(),
        };
        payments.set(record.id, record);
        return structuredClone(record);
      },
    },
  };
}
