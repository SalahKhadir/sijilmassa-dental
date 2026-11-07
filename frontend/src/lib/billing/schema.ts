import { z } from "zod";
import { isCalendarDate } from "../patients/dates.ts";
import { lineTotal, parseMinor, sumMinor } from "./money.ts";
import type { InvoiceInput } from "./types.ts";
const integer = z
  .number({ error: "Saisissez un nombre entier valide." })
  .int("Saisissez un entier.")
  .min(0, "Le montant ne peut pas être négatif.")
  .max(Number.MAX_SAFE_INTEGER, "La valeur dépasse la limite de calcul.");
export const invoiceLineSchema = z.object({
  id: z.string().min(1).optional(),
  performedDate: z
    .string()
    .optional()
    .refine(
      (value) => !value || isCalendarDate(value),
      "Saisissez une date d’acte valide.",
    ),
  toothNumber: z
    .string()
    .trim()
    .max(20, "Limitez le numéro de dent à 20 caractères.")
    .optional(),
  description: z
    .string()
    .trim()
    .min(1, "Renseignez la désignation.")
    .max(700, "Limitez la désignation à 700 caractères."),
  quantity: integer.min(1, "La quantité doit être strictement positive."),
  unitPriceMinor: integer,
  serviceId: z.string(),
  sourceTreatmentId: z.string(),
});
export const invoiceSchema = z
  .object({
    patientId: z.string().min(1, "Sélectionnez un patient."),
    consultationId: z.string(),
    issueDate: z.string().refine(isCalendarDate, "Saisissez une date valide."),
    lines: z
      .array(invoiceLineSchema)
      .max(100, "Limitez la facture à 100 lignes."),
  })
  .superRefine((value, context) => {
    try {
      sumMinor(
        value.lines.map((line) =>
          lineTotal(line.quantity, line.unitPriceMinor),
        ),
      );
    } catch {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Le total dépasse la limite de calcul prise en charge.",
      });
    }
    const ids = value.lines.flatMap((line) => (line.id ? [line.id] : []));
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Chaque ligne doit avoir un identifiant distinct.",
      });
  });
export const issuedInvoiceSchema = invoiceSchema.refine(
  (value) => value.lines.length > 0,
  {
    path: ["lines"],
    message: "Ajoutez au moins une ligne avant d’émettre la facture.",
  },
);
export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amountMinor: integer.min(1, "Le règlement doit être strictement positif."),
  paymentDate: z.string().refine(isCalendarDate, "Saisissez une date valide."),
  method: z.enum(["ESPECES", "CARTE", "VIREMENT", "CHEQUE", "AUTRE"], {
    error: "Choisissez un mode de règlement.",
  }),
  reference: z
    .string()
    .trim()
    .max(100, "Limitez la référence à 100 caractères."),
  notes: z
    .string()
    .trim()
    .max(500, "Limitez les notes administratives à 500 caractères."),
  operationId: z.string().min(1).max(100),
});
export const cancellationSchema = z
  .string()
  .trim()
  .min(1, "Indiquez le motif d’annulation.")
  .max(500, "Limitez le motif à 500 caractères.");
const moneyText = z.string().refine((value) => {
  try {
    parseMinor(value);
    return true;
  } catch {
    return false;
  }
}, "Saisissez un montant positif ou nul, sans séparateur de milliers et avec deux décimales au maximum.");
export const invoiceEditorSchema = z.object({
  patientId: z.string().min(1, "Sélectionnez un patient."),
  consultationId: z.string(),
  issueDate: z.string().refine(isCalendarDate, "Saisissez une date valide."),
  lines: z
    .array(
      invoiceLineSchema.omit({ unitPriceMinor: true }).extend({
        performedDate: z
          .string()
          .refine(isCalendarDate, "Saisissez une date d’acte valide."),
        toothNumber: z
          .string()
          .trim()
          .max(20, "Limitez le numéro de dent à 20 caractères."),
        unitPrice: moneyText,
      }),
    )
    .max(100, "Limitez la facture à 100 lignes."),
});
export type InvoiceEditorValues = z.infer<typeof invoiceEditorSchema>;
export function editorInput(values: InvoiceEditorValues): InvoiceInput {
  return {
    ...values,
    lines: values.lines.map(({ unitPrice, ...line }) => ({
      ...line,
      unitPriceMinor: parseMinor(unitPrice),
    })),
  };
}
export const paymentEditorSchema = paymentSchema
  .omit({ amountMinor: true, operationId: true })
  .extend({
    amount: moneyText.refine((value) => {
      try {
        return parseMinor(value) > 0;
      } catch {
        return false;
      }
    }, "Le règlement doit être strictement positif."),
  });
export type PaymentEditorValues = z.infer<typeof paymentEditorSchema>;
