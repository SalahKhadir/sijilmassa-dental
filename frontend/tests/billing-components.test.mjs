import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceList } from "../src/components/billing/invoice-list.tsx";
import { InvoiceStatus } from "../src/components/billing/invoice-status.tsx";
import { PaymentHistory } from "../src/components/billing/payment-history.tsx";
import { FinancialSummary } from "../src/components/billing/financial-summary.tsx";
import {
  BillingNotice,
  BillingLoading,
  BillingErrorState,
  InvoiceMissing,
} from "../src/components/billing/billing-states.tsx";
import { InvoicePdfPreview } from "../src/components/billing/invoice-pdf-preview.tsx";
import { invoiceFixtures, paymentFixtures } from "../src/data/billing.ts";
import { patientFixtures } from "../src/data/patients.ts";
import { prescriptionPatient } from "../src/lib/prescriptions/repository.ts";
import { financialSummary } from "../src/lib/billing/calculations.ts";
import { formatMinor } from "../src/lib/billing/money.ts";
const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
test("invoice table and mobile cards show financial values without clinical questionnaire or notes", () => {
  const html = render(InvoiceList, {
    invoices: invoiceFixtures,
    payments: paymentFixtures,
    patients: patientFixtures.map(prescriptionPatient),
  });
  for (const text of [
    "2026-001",
    "Partiellement payée",
    "Reste à encaisser",
    "Facture",
    "Patient",
  ])
    assert(html.includes(text));
  assert(html.includes(formatMinor(95000)));
  assert(!html.includes("Précision entièrement fictive"));
  assert(!html.includes("Antécédents médicaux"));
  assert.match(
    render(InvoiceList, { invoices: [], payments: [], patients: [] }),
    /Aucune facture/,
  );
});
test("all displayed invoice statuses use French text and accessible decorative icons", () => {
  for (const status of [
    "BROUILLON",
    "EMISE",
    "PARTIELLEMENT_PAYEE",
    "PAYEE",
    "ANNULEE",
  ]) {
    const html = render(InvoiceStatus, { status });
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /<svg/);
  }
});
test("payment history is chronological and read-only with amounts recorded at invoice level", () => {
  const records = [
    { ...paymentFixtures[1], id: "a", paymentDate: "2026-11-02" },
    { ...paymentFixtures[0], id: "b", paymentDate: "2026-11-01" },
  ];
  const html = render(PaymentHistory, { payments: records });
  assert(html.indexOf("01/11/2026") < html.indexOf("02/11/2026"));
  assert(!html.includes("<button"));
  assert.match(render(PaymentHistory, { payments: [] }), /Aucun règlement/);
});
test("summary labels distinguish charges receipts and balances and invoice PDF starts accessibly", () => {
  const html = render(FinancialSummary, {
    summary: financialSummary(invoiceFixtures, paymentFixtures),
  });
  for (const label of [
    "Montant facturé",
    "Montant encaissé",
    "Reste à encaisser",
  ])
    assert(html.includes(label));
  assert.match(render(BillingNotice), /Données fictives/);
  assert.match(render(BillingLoading), /role="status"/);
  assert.match(render(BillingErrorState, { retry() {} }), /Réessayer/);
  assert.match(render(InvoiceMissing), /introuvable/);
  const pdf = render(InvoicePdfPreview, {
    invoice: invoiceFixtures[1],
    payments: paymentFixtures,
    patient: patientFixtures.map(prescriptionPatient)[1],
  });
  assert.match(pdf, /Aperçu de la facture/);
  assert.match(pdf, /Préparation du PDF/);
});
