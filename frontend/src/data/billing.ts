import type {
  BillableService,
  Invoice,
  Payment,
} from "../lib/billing/types.ts";
import { patientFixtures } from "./patients.ts";
/** All prices and descriptions are fictional examples, freely overridable. */
export const billableServiceFixtures: readonly BillableService[] = [
  {
    id: "service-demo-001",
    name: "Consultation de démonstration",
    category: "Consultation",
    description: "Exemple de prestation",
    suggestedPriceMinor: 30000,
    active: true,
  },
  {
    id: "service-demo-002",
    name: "Détartrage de démonstration",
    category: "Soin",
    description: "Exemple de prestation",
    suggestedPriceMinor: 40000,
    active: true,
  },
  {
    id: "service-demo-003",
    name: "Prestation à préciser",
    category: "Autre",
    description: "Prix à saisir par le dentiste",
    active: true,
  },
];
export const invoiceFixtures: readonly Invoice[] = Array.from(
  { length: 13 },
  (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    const id = `invoice-demo-${number}`;
    const patient = patientFixtures[index];
    const issueDate = `2026-11-${String((index % 7) + 1).padStart(2, "0")}`;
    const timestamp = `${issueDate}T10:00:00.000Z`;
    const lifecycle =
      index === 12 ? "ANNULEE" : index % 4 === 0 ? "BROUILLON" : "EMISE";
    return {
      id,
      patientId: patient.id,
      consultationId: `consultation-demo-${number}`,
      issueDate,
      lifecycle,
      invoiceNumber:
        lifecycle === "BROUILLON"
          ? ""
          : `2026-${String(index === 12 ? 10 : index - Math.floor(index / 4)).padStart(3, "0")}`,
      lines: [
        {
          id: `${id}-line-1`,
          performedDate: issueDate,
          toothNumber: index % 3 === 0 ? "16" : "",
          description: "Prestation fictive A",
          quantity: 1,
          unitPriceMinor: 45000,
          lineTotalMinor: 45000,
          serviceId: "",
          sourceTreatmentId: index === 1 ? "consultation-demo-002-care-1" : "",
        },
        {
          id: `${id}-line-2`,
          performedDate: issueDate,
          toothNumber: "",
          description: "Prestation fictive B",
          quantity: 1,
          unitPriceMinor: 50000,
          lineTotalMinor: 50000,
          serviceId: "",
          sourceTreatmentId: "",
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(lifecycle !== "BROUILLON"
        ? {
            finalizedAt: timestamp,
            issuedPatient: {
              name: `${patient.identity.firstName} ${patient.identity.lastName}`,
              reference: patient.reference,
            },
          }
        : {}),
      ...(lifecycle === "ANNULEE"
        ? {
            cancelledAt: timestamp,
            cancellationReason: "Annulation fictive sans règlement.",
          }
        : {}),
    };
  },
);
export const paymentFixtures: readonly Payment[] = invoiceFixtures.flatMap(
  (invoice, index) => {
    if (invoice.lifecycle !== "EMISE" || index % 4 < 2) return [];
    const amounts = index % 4 === 2 ? [40000, 30000] : [95000];
    return amounts.map((amountMinor, position) => ({
      id: `payment-demo-${String(index * 2 + position + 1).padStart(3, "0")}`,
      invoiceId: invoice.id,
      patientId: invoice.patientId,
      amountMinor,
      paymentDate: invoice.issueDate,
      method: "ESPECES",
      reference: "",
      notes: "Exemple administratif fictif.",
      operationId: `seed-${invoice.id}-${position}`,
      createdAt: `${invoice.issueDate}T11:00:00.000Z`,
    }));
  },
);
