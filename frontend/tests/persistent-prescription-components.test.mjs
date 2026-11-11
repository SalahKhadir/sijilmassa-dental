import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { prescriptionHref, PrescriptionFailure, PrescriptionLoading, StoredPrescriptionStatus, PrescriptionNavigation } from "../src/components/prescriptions/persistent/shared.tsx";
import { PrescriptionApiError } from "../src/lib/prescriptions/api/client.ts";
import { PrescriptionList } from "../src/components/prescriptions/prescription-list.tsx";
import { prescriptionFixtures } from "../src/data/prescriptions.ts";
import { patientFixtures } from "../src/data/patients.ts";
import { prescriptionPatient } from "../src/lib/prescriptions/repository.ts";
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const r = { id: "00000000-0000-4000-8000-000000000001", patientId: "00000000-0000-4000-8000-000000000002", notes: "SYNTHETIC-PRIVATE-CONTENT" };
test("real prescription links retain patient scope and exclude medical content", () => {
  assert.equal(prescriptionHref(r, "/modifier"), `/documents/ordonnances/${r.id}/modifier?patientId=${r.patientId}`);
  assert(!prescriptionHref(r).includes(r.notes));
  const html = render(PrescriptionNavigation, { patientId: r.patientId, consultationId: r.id });
  assert(html.includes(`/consultations/${r.id}?patientId=${r.patientId}`)); assert(!html.includes("/demo/"));
});
test("persisted lifecycle labels distinguish archived drafts without inventing a status", () => {
  assert.match(render(StoredPrescriptionStatus, { status: "BROUILLON", archivedAt: null }), /Brouillon/);
  assert.match(render(StoredPrescriptionStatus, { status: "BROUILLON", archivedAt: "2026-11-11T09:00:00Z" }), /Brouillon archivé/);
  assert.match(render(StoredPrescriptionStatus, { status: "FINALISEE", archivedAt: null }), /Finalisée/);
});
test("read failures and loading states are accessible and never echo arbitrary backend messages", () => {
  const error = new Error(r.notes);
  const html = render(PrescriptionFailure, { error }); assert.match(html, /role="alert"/); assert(!html.includes(error.message));
  assert.match(render(PrescriptionFailure, { error: new PrescriptionApiError(503) }), /indisponible/);
  assert.match(render(PrescriptionLoading), /role="status"/);
});
test("retained prototype prescription links target demo routes only", () => {
  const html = render(PrescriptionList, { records: prescriptionFixtures, patients: patientFixtures.map(prescriptionPatient) });
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]); assert(links.length > 0); assert(links.every(href => href.startsWith("/demo/")));
});
test("operational screens use the typed foundation without fixtures, browser storage or PDF generation", async () => {
  for (const file of ["forms.tsx", "history.tsx", "record.tsx", "pdf-panel.tsx", "shared.tsx"]) {
    const source = await readFile(new URL(`../src/components/prescriptions/persistent/${file}`, import.meta.url), "utf8");
    assert(!/from ["'].*(?:\/data\/|pdf\/service|pdf\/renderer|prescription-provider)/.test(source));
    assert(!/localStorage|sessionStorage|indexedDB|console\./.test(source));
  }
  const editor = await readFile(new URL("../src/components/prescriptions/persistent/forms.tsx", import.meta.url), "utf8");
  assert(editor.includes("usePrescriptionDraftForm")); assert(editor.includes("Recharger et remplacer mes saisies"));
  const record = await readFile(new URL("../src/components/prescriptions/persistent/record.tsx", import.meta.url), "utf8");
  assert(record.includes("document.patientIdentity")); assert(record.includes("usePrescriptionAction"));
});
