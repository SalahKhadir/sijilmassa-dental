import assert from "node:assert/strict";
import test from "node:test";
import {
  parseMinor,
  minorInput,
  formatMinor,
  lineTotal,
  sumMinor,
  BillingError,
} from "../src/lib/billing/money.ts";
import {
  invoiceSchema,
  issuedInvoiceSchema,
  editorInput,
} from "../src/lib/billing/schema.ts";
import {
  invoiceTotal,
  settlement,
  invoiceStatus,
  financialSummary,
} from "../src/lib/billing/calculations.ts";
import { createInMemoryBillingRepositories } from "../src/lib/billing/repository.ts";
import { filterInvoices } from "../src/lib/billing/selectors.ts";
import { clinicFinancialIdentifiers } from "../src/lib/billing/pdf-service.ts";
import { nextInvoiceNumber } from "../src/lib/billing/numbering.ts";
import { createInMemoryPatientRepository } from "../src/lib/patients/repository.ts";
import { createInMemoryAppointmentRepository } from "../src/lib/appointments/repository.ts";
import { createInMemoryConsultationRepository } from "../src/lib/consultations/repository.ts";
import { prescriptionPatient } from "../src/lib/prescriptions/repository.ts";
import { patientFixtures } from "../src/data/patients.ts";
import { appointmentFixtures } from "../src/data/appointments.ts";
import { consultationFixtures } from "../src/data/consultations.ts";
import {
  invoiceFixtures,
  paymentFixtures,
  billableServiceFixtures,
} from "../src/data/billing.ts";
const clock = () => new Date("2026-11-07T12:00:00Z");
const line = (overrides = {}) => ({
  performedDate: "2026-11-07",
  toothNumber: "16",
  description: "Prestation fictive",
  quantity: 1,
  unitPriceMinor: 95000,
  serviceId: "",
  sourceTreatmentId: "",
  ...overrides,
});
const input = (overrides = {}) => ({
  patientId: "patient-demo-001",
  consultationId: "",
  issueDate: "2026-11-07",
  lines: [line()],
  ...overrides,
});
const payment = (
  invoiceId,
  amountMinor,
  operationId = "operation-a",
  overrides = {},
) => ({
  invoiceId,
  amountMinor,
  operationId,
  paymentDate: "2026-11-07",
  method: "ESPECES",
  reference: "",
  notes: "",
  ...overrides,
});
function setup(
  seed = { invoices: [], payments: [], services: billableServiceFixtures },
) {
  const patients = createInMemoryPatientRepository(patientFixtures, clock);
  const appointments = createInMemoryAppointmentRepository(
    appointmentFixtures,
    patients,
  );
  const consultations = createInMemoryConsultationRepository(
    consultationFixtures,
    patients,
    appointments,
  );
  return {
    patients,
    consultations,
    ...createInMemoryBillingRepositories(seed, patients, consultations, clock),
  };
}
async function issued(repositories, details = input()) {
  return repositories.invoices.issue(
    (await repositories.invoices.create(details)).id,
  );
}
test("MAD input is parsed without binary fractions, grouping or silent rounding", () => {
  for (const [text, minor] of [
    ["0", 0],
    ["0,01", 1],
    ["0.1", 10],
    ["350,00", 35000],
    [" 450.99 ", 45099],
    [minorInput(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])
    assert.equal(parseMinor(text), minor);
  for (const text of [
    "",
    "-1",
    "1,001",
    "1.999",
    "1e2",
    "1 000,00",
    "1,000.00",
    "Infinity",
    "90071992547409,92",
  ])
    assert.throws(() => parseMinor(text), BillingError);
  assert.equal(minorInput(199), "1,99");
  assert(formatMinor(Number.MAX_SAFE_INTEGER).endsWith(",91 DH"));
});
test("line multiplication and all monetary sums check safe integer bounds", () => {
  assert.equal(lineTotal(3, 35001), 105003);
  assert.equal(sumMinor([40000, 30000]), 70000);
  for (const [quantity, price] of [
    [0, 100],
    [1.5, 100],
    [1, -1],
    [2, Number.MAX_SAFE_INTEGER],
    [NaN, 100],
  ])
    assert.throws(() => lineTotal(quantity, price), BillingError);
  assert.throws(() => sumMinor([Number.MAX_SAFE_INTEGER, 1]), BillingError);
  assert.throws(() => formatMinor(-1), BillingError);
});
test("invoice schema validates dates, lines, integer quantities, descriptions and duplicate ids", () => {
  const missingQuantity = invoiceSchema.safeParse(
    input({ lines: [line({ quantity: NaN })] }),
  );
  assert(!missingQuantity.success);
  assert.equal(
    missingQuantity.error.issues[0].message,
    "Saisissez un nombre entier valide.",
  );
  assert(invoiceSchema.safeParse(input({ lines: [] })).success);
  assert(!issuedInvoiceSchema.safeParse(input({ lines: [] })).success);
  for (const data of [
    input({ issueDate: "2026-02-30" }),
    input({ patientId: "" }),
    input({ lines: [line({ description: " " })] }),
    input({ lines: [line({ quantity: 0 })] }),
    input({ lines: [line({ unitPriceMinor: 1.2 })] }),
    input({
      lines: [line({ quantity: 2, unitPriceMinor: Number.MAX_SAFE_INTEGER })],
    }),
    input({ lines: [line({ id: "same" }), line({ id: "same" })] }),
  ])
    assert(!invoiceSchema.safeParse(data).success);
  assert.equal(
    editorInput({
      ...input({ lines: [] }),
      lines: [{ ...line(), unitPrice: "350,25" }],
    }).lines[0].unitPriceMinor,
    35025,
  );
  assert.equal(
    editorInput({
      ...input({ lines: [] }),
      lines: [{ ...line(), unitPrice: "350,25" }],
    }).lines[0].performedDate,
    "2026-11-07",
  );
});
test("fixtures reference existing patients, consultations and payments with exact stored totals", () => {
  assert.equal(
    new Set(invoiceFixtures.map((invoice) => invoice.id)).size,
    invoiceFixtures.length,
  );
  const numbered = invoiceFixtures.filter((invoice) => invoice.invoiceNumber);
  assert.equal(
    new Set(numbered.map((invoice) => invoice.invoiceNumber)).size,
    numbered.length,
  );
  for (const invoice of invoiceFixtures) {
    assert(invoiceSchema.safeParse(invoice).success);
    assert(patientFixtures.some((patient) => patient.id === invoice.patientId));
    assert(
      consultationFixtures.some(
        (consultation) =>
          consultation.id === invoice.consultationId &&
          consultation.patientId === invoice.patientId,
      ),
    );
    for (const row of invoice.lines)
      assert.equal(
        row.lineTotalMinor,
        lineTotal(row.quantity, row.unitPriceMinor),
      );
  }
  for (const record of paymentFixtures) {
    const invoice = invoiceFixtures.find(
      (invoice) => invoice.id === record.invoiceId,
    );
    assert(invoice);
    assert.equal(invoice.patientId, record.patientId);
    assert.equal(invoice.lifecycle, "EMISE");
  }
  assert.deepEqual(financialSummary(invoiceFixtures, paymentFixtures), {
    invoiced: 855000,
    collected: 495000,
    outstanding: 360000,
    partiallyPaid: 3,
    unpaid: 3,
  });
});
test("dentist-controlled prices may override the same catalog suggestion in both directions", async () => {
  const repositories = setup();
  const service = await repositories.services.getById("service-demo-002");
  assert.equal(service.suggestedPriceMinor, 40000);
  const a = await repositories.invoices.create(
    input({ lines: [line({ serviceId: service.id, unitPriceMinor: 35000 })] }),
  );
  const b = await repositories.invoices.create(
    input({ lines: [line({ serviceId: service.id, unitPriceMinor: 45000 })] }),
  );
  service.suggestedPriceMinor = 99999;
  assert.equal(
    (await repositories.invoices.getById(a.id)).lines[0].unitPriceMinor,
    35000,
  );
  assert.equal(
    (await repositories.invoices.getById(b.id)).lines[0].unitPriceMinor,
    45000,
  );
  assert.equal(
    (await repositories.services.getById(service.id)).suggestedPriceMinor,
    40000,
  );
  const custom = await repositories.invoices.create(
    input({ lines: [line({ unitPriceMinor: 0 })] }),
  );
  assert.equal(invoiceTotal(custom), 0);
});
test("draft edits preserve stable line ids, recompute totals, allow removal and keep the patient", async () => {
  const repositories = setup();
  const created = await repositories.invoices.create(
    input({ lines: [line(), line({ unitPriceMinor: 1000 })] }),
  );
  const modified = await repositories.invoices.updateDraft(created.id, {
    ...created,
    lines: [
      { ...created.lines[1], quantity: 3, unitPriceMinor: 2000 },
      created.lines[0],
    ],
  });
  assert.equal(modified.lines[0].id, created.lines[1].id);
  assert.equal(modified.lines[0].lineTotalMinor, 6000);
  assert.equal(modified.createdAt, created.createdAt);
  const reduced = await repositories.invoices.updateDraft(created.id, {
    ...modified,
    lines: [modified.lines[0]],
  });
  const expanded = await repositories.invoices.updateDraft(created.id, {
    ...reduced,
    lines: [...reduced.lines, line()],
  });
  assert(!created.lines.some((old) => old.id === expanded.lines[1].id));
  await assert.rejects(
    repositories.invoices.updateDraft(created.id, {
      ...expanded,
      patientId: "patient-demo-002",
    }),
    /patient.*conservé/,
  );
  await assert.rejects(
    repositories.invoices.updateDraft(created.id, {
      ...expanded,
      lines: [line({ id: "foreign" })],
    }),
    /référence de ligne/,
  );
});
test("issuance assigns year-NNN numbers, snapshots patient identity and locks lines", async () => {
  const repositories = setup();
  const draft = await repositories.invoices.create(input());
  assert.equal(draft.invoiceNumber, "");
  const invoice = await repositories.invoices.issue(draft.id);
  assert.equal(invoice.invoiceNumber, "2026-001");
  assert.equal(invoice.finalizedAt, clock().toISOString());
  assert.equal(invoice.issuedPatient.reference, patientFixtures[0].reference);
  await repositories.patients.update(invoice.patientId, {
    identity: { firstName: "Prénom fictif corrigé" },
  });
  assert.deepEqual(
    (await repositories.invoices.getById(invoice.id)).issuedPatient,
    invoice.issuedPatient,
  );
  await assert.rejects(
    repositories.invoices.updateDraft(invoice.id, input()),
    /lecture seule/,
  );
  await assert.rejects(
    repositories.invoices.issue(invoice.id),
    /lecture seule/,
  );
});
test("concurrent issuance has unique numbers and cancellation never reuses a number", async () => {
  const repositories = setup();
  const drafts = await Promise.all([
    repositories.invoices.create(input()),
    repositories.invoices.create(input()),
  ]);
  const invoices = await Promise.all(
    drafts.map((invoice) => repositories.invoices.issue(invoice.id)),
  );
  assert.notEqual(invoices[0].invoiceNumber, invoices[1].invoiceNumber);
  await repositories.invoices.cancel(
    invoices[1].id,
    "Erreur fictive sans règlement",
  );
  assert.equal((await issued(repositories)).invoiceNumber, "2026-003");
  assert.equal(
    (await issued(repositories, input({ issueDate: "2025-12-31" })))
      .invoiceNumber,
    "2025-001",
  );
});
test("global summary overflow rejects issuance atomically while leaving the draft editable", async () => {
  const repositories = setup();
  await issued(
    repositories,
    input({ lines: [line({ unitPriceMinor: Number.MAX_SAFE_INTEGER })] }),
  );
  const draft = await repositories.invoices.create(
    input({ lines: [line({ unitPriceMinor: 1 })] }),
  );
  await assert.rejects(
    repositories.invoices.issue(draft.id),
    /limite de calcul/,
  );
  assert.equal(
    (await repositories.invoices.getById(draft.id)).lifecycle,
    "BROUILLON",
  );
  assert.equal(
    (await repositories.invoices.getById(draft.id)).invoiceNumber,
    "",
  );
});
test("multiple partial payments derive balances and reject the user's 300 MAD overpayment example", async () => {
  const repositories = setup();
  const invoice = await issued(repositories);
  await repositories.payments.create(payment(invoice.id, 40000, "a"));
  await repositories.payments.create(payment(invoice.id, 30000, "b"));
  let payments = await repositories.payments.list();
  assert.equal(settlement(invoice, payments).remaining, 25000);
  assert.equal(invoiceStatus(invoice, payments), "PARTIELLEMENT_PAYEE");
  await assert.rejects(
    repositories.payments.create(payment(invoice.id, 30000, "c")),
    /dépasse/,
  );
  assert.equal((await repositories.payments.list()).length, 2);
  await repositories.payments.create(payment(invoice.id, 25000, "c"));
  payments = await repositories.payments.list();
  assert.equal(invoiceStatus(invoice, payments), "PAYEE");
  assert.equal(settlement(invoice, payments).remaining, 0);
});
test("concurrent payments cannot overpay and idempotent requests cannot duplicate receipts", async () => {
  const repositories = setup();
  const invoice = await issued(repositories);
  const results = await Promise.allSettled([
    repositories.payments.create(payment(invoice.id, 60000, "a")),
    repositories.payments.create(payment(invoice.id, 60000, "b")),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal((await repositories.payments.list()).length, 1);
  const received = await repositories.payments.create(
    payment(invoice.id, 35000, "c"),
  );
  const retry = await repositories.payments.create(
    payment(invoice.id, 35000, "c"),
  );
  assert.equal(received.id, retry.id);
  await assert.rejects(
    repositories.payments.create(payment(invoice.id, 30000, "c")),
    /autre contenu/,
  );
  assert.equal((await repositories.payments.list()).length, 2);
});
test("drafts cancelled invoices and invalid amounts cannot receive payments", async () => {
  const repositories = setup();
  const draft = await repositories.invoices.create(input());
  await assert.rejects(
    repositories.payments.create(payment(draft.id, 10000)),
    /facture émise/,
  );
  const invoice = await repositories.invoices.issue(draft.id);
  await repositories.invoices.cancel(invoice.id, "Annulation fictive");
  await assert.rejects(
    repositories.payments.create(payment(invoice.id, 10000)),
    /facture émise/,
  );
  const active = await issued(repositories);
  for (const amount of [0, -1, 1.2, Infinity, Number.MAX_SAFE_INTEGER + 1])
    await assert.rejects(
      repositories.payments.create(payment(active.id, amount)),
    );
  assert.equal((await repositories.payments.list()).length, 0);
});
test("cancellation preserves history and is refused after any recorded payment", async () => {
  const repositories = setup();
  const invoice = await issued(repositories);
  await repositories.payments.create(payment(invoice.id, 1));
  await assert.rejects(
    repositories.invoices.cancel(invoice.id, "Erreur"),
    /règlements/,
  );
  const paid = await repositories.payments.list();
  assert.equal(paid.length, 1);
  assert.equal(
    (await repositories.invoices.getById(invoice.id)).lifecycle,
    "EMISE",
  );
  const unpaid = await issued(repositories);
  await assert.rejects(repositories.invoices.cancel(unpaid.id, " "));
  const cancelled = await repositories.invoices.cancel(
    unpaid.id,
    "Annulation fictive",
  );
  assert.equal(invoiceStatus(cancelled, paid), "ANNULEE");
  assert.equal(cancelled.invoiceNumber, unpaid.invoiceNumber);
  assert.equal(settlement(cancelled, paid).receivable, 0);
});
test("payment versus cancellation races leave one consistent financial outcome", async () => {
  const repositories = setup();
  const invoice = await issued(repositories);
  const results = await Promise.allSettled([
    repositories.payments.create(payment(invoice.id, 10000)),
    repositories.invoices.cancel(invoice.id, "Annulation simultanée"),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    (await repositories.invoices.getById(invoice.id)).lifecycle,
    "EMISE",
  );
  assert.equal((await repositories.payments.list()).length, 1);
});
test("patient consultation service and treatment references are checked without changing clinical facts", async () => {
  const repositories = setup();
  const before = await repositories.consultations.getById(
    "consultation-demo-002",
  );
  await assert.rejects(
    repositories.invoices.create(input({ patientId: "missing" })),
    /patient est introuvable/,
  );
  await assert.rejects(
    repositories.invoices.create(
      input({ consultationId: "consultation-demo-002" }),
    ),
    /appartenir/,
  );
  await assert.rejects(
    repositories.invoices.create(input({ consultationId: "missing" })),
    /appartenir/,
  );
  await assert.rejects(
    repositories.invoices.create(
      input({ lines: [line({ serviceId: "missing" })] }),
    ),
    /catalogue/,
  );
  await assert.rejects(
    repositories.invoices.create(
      input({ lines: [line({ sourceTreatmentId: before.treatments[0].id })] }),
    ),
    /soin lié/,
  );
  const details = input({
    patientId: before.patientId,
    consultationId: before.id,
    lines: [line({ sourceTreatmentId: before.treatments[0].id })],
  });
  await repositories.invoices.create(details);
  await assert.rejects(repositories.invoices.create(details), /déjà/);
  assert.deepEqual(await repositories.consultations.getById(before.id), before);
});
test("unknown ids, snapshots, concurrent creation and newly created patients use consistent shared repositories", async () => {
  const repositories = setup();
  assert.equal(await repositories.invoices.getById("missing"), undefined);
  await assert.rejects(repositories.invoices.issue("missing"), /introuvable/);
  await assert.rejects(
    repositories.invoices.updateDraft("missing", input()),
    /introuvable/,
  );
  await assert.rejects(
    repositories.invoices.cancel("missing", "Erreur"),
    /introuvable/,
  );
  await assert.rejects(
    repositories.payments.create(payment("missing", 1)),
    /introuvable/,
  );
  const patient = await repositories.patients.create(patientFixtures[0]);
  const invoices = await Promise.all([
    repositories.invoices.create(input({ patientId: patient.id })),
    repositories.invoices.create(input({ patientId: patient.id })),
  ]);
  assert.notEqual(invoices[0].id, invoices[1].id);
  invoices[0].lines[0].unitPriceMinor = 5;
  assert.equal(
    (await repositories.invoices.getById(invoices[0].id)).lines[0]
      .unitPriceMinor,
    95000,
  );
  assert.equal((await setup().invoices.list()).length, 0);
});
test("financial summaries exclude drafts and cancellations and do not allocate payments to treatments", async () => {
  const repositories = setup();
  const draft = await repositories.invoices.create(
    input({
      lines: [line({ unitPriceMinor: 45000 }), line({ unitPriceMinor: 50000 })],
    }),
  );
  const invoice = await repositories.invoices.issue(draft.id);
  await repositories.payments.create(payment(invoice.id, 40000));
  await repositories.invoices.create(input());
  const cancelled = await issued(repositories);
  await repositories.invoices.cancel(cancelled.id, "Annulation fictive");
  assert.deepEqual(
    financialSummary(
      await repositories.invoices.list(),
      await repositories.payments.list(),
    ),
    {
      invoiced: 95000,
      collected: 40000,
      outstanding: 55000,
      partiallyPaid: 1,
      unpaid: 0,
    },
  );
  const record = (await repositories.payments.list())[0];
  assert(!("lineId" in record));
  assert(!("sourceTreatmentId" in record));
});
test("directory searches only invoice or administrative identity, filters and sorts without mutation", () => {
  const people = patientFixtures.map(prescriptionPatient);
  const query = { search: "", status: "all", from: "", to: "", sort: "newest" };
  assert.equal(
    filterInvoices(invoiceFixtures, paymentFixtures, people, query).length,
    13,
  );
  assert.equal(
    filterInvoices(invoiceFixtures, paymentFixtures, people, {
      ...query,
      status: "PARTIELLEMENT_PAYEE",
    }).length,
    3,
  );
  assert.equal(
    filterInvoices(invoiceFixtures, paymentFixtures, people, {
      ...query,
      search: "2026-001",
    }).length,
    1,
  );
  assert.equal(
    filterInvoices(invoiceFixtures, paymentFixtures, people, {
      ...query,
      search: "Précision entièrement fictive",
    }).length,
    0,
  );
  assert(
    filterInvoices(invoiceFixtures, paymentFixtures, people, {
      ...query,
      from: "2026-11-03",
      to: "2026-11-04",
    }).every(
      (invoice) =>
        invoice.issueDate >= "2026-11-03" && invoice.issueDate <= "2026-11-04",
    ),
  );
});
test("numbering remains isolated and clinic identifiers remain immutable", () => {
  assert.equal(nextInvoiceNumber("2026-12-01", invoiceFixtures), "2026-011");
  assert.equal(nextInvoiceNumber("2027-01-01", invoiceFixtures), "2027-001");
  assert.deepEqual(clinicFinancialIdentifiers, {
    inp: "084209071",
    ice: "003999044000004",
    if: "73149010",
  });
});
