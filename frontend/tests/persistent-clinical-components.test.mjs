import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { clinicalHref } from "../src/components/consultations/persistent/forms.tsx";
import { ClinicalFailure, ClinicalLoading } from "../src/components/consultations/persistent/shared.tsx";
import { ClinicalApiError } from "../src/lib/consultations/api/client.ts";
import { ConsultationList } from "../src/components/consultations/consultation-list.tsx";
import { consultationFixtures } from "../src/data/consultations.ts";
import { patientFixtures } from "../src/data/patients.ts";

test("real clinical links preserve patient scope without serializing clinical content", () => {
  const record = { id: "00000000-0000-4000-8000-000000000001", patientId: "00000000-0000-4000-8000-000000000002", notes: "PRIVATE-SYNTHETIC-NOTE" };
  const path = clinicalHref(record, "/modifier");
  assert.equal(path, `/consultations/${record.id}/modifier?patientId=${record.patientId}`);
  assert(!path.includes(record.notes)); assert(!clinicalHref(record, "", "created").includes(record.notes));
});
test("retained prototype consultation links are explicitly isolated under demo", () => {
  const html = renderToStaticMarkup(createElement(ConsultationList, { records: consultationFixtures.slice(0, 2), patients: patientFixtures }));
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]).filter(href => href.includes("consultations"));
  assert(links.length > 0); assert(links.every(href => href.startsWith("/demo/consultations/")));
});
test("clinical read failures announce safe messages without backend exception contents", () => {
  const privateError = new Error("SQL SELECT PRIVATE-SYNTHETIC-NOTE");
  const html = renderToStaticMarkup(createElement(ClinicalFailure, { error: privateError }));
  assert.match(html, /role="alert"/); assert(!html.includes(privateError.message));
  const unavailable = renderToStaticMarkup(createElement(ClinicalFailure, { error: new ClinicalApiError(503) }));
  assert.match(unavailable, /indisponible/); assert(!unavailable.includes("SQL"));
});
test("clinical loading is an accessible non-fictional state", () => {
  const html = renderToStaticMarkup(createElement(ClinicalLoading));
  assert.match(html, /role="status"/); assert.match(html, /aria-live="polite"/); assert(!html.includes("fictive"));
});
