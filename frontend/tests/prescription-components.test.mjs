import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrescriptionStatus } from "../src/components/prescriptions/prescription-status.tsx";
import { PrescriptionList } from "../src/components/prescriptions/prescription-list.tsx";
import {
  PrescriptionNotice,
  PrescriptionLoading,
  PrescriptionMissing,
  PrescriptionErrorState,
} from "../src/components/prescriptions/prescription-states.tsx";
import { BlankPrescriptionPage } from "../src/components/prescriptions/blank-prescription-page.tsx";
import { prescriptionFixtures } from "../src/data/prescriptions.ts";
import { patientFixtures } from "../src/data/patients.ts";
import { prescriptionPatient } from "../src/lib/prescriptions/repository.ts";
const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
test("prescription history exposes dates, statuses and links while medication details stay in dedicated screens", () => {
  const html = render(PrescriptionList, {
    records: prescriptionFixtures,
    patients: patientFixtures.map(prescriptionPatient),
  });
  assert(html.includes("Aperçu et téléchargement"));
  assert(html.includes("Voir la consultation liée"));
  for (const record of prescriptionFixtures)
    for (const medication of record.medications)
      assert(!html.includes(medication.medicationName));
  assert.match(
    render(PrescriptionList, { records: [], patients: [] }),
    /Aucune ordonnance/,
  );
});
test("statuses have text and icons, and loading missing retry and fictional data states are explicit", () => {
  for (const status of ["BROUILLON", "FINALISEE"])
    assert.match(render(PrescriptionStatus, { status }), /aria-hidden="true"/);
  assert.match(render(PrescriptionLoading), /role="status"/);
  assert.match(render(PrescriptionMissing), /introuvable/);
  assert.match(render(PrescriptionErrorState, { retry() {} }), /Réessayer/);
  assert.match(render(PrescriptionNotice), /Données fictives/);
});
test("blank workflow labels the official handwritten template and avoids patient-specific content", () => {
  const html = render(BlankPrescriptionPage);
  assert.match(html, /Ordonnance vierge A5/);
  assert.match(html, /saisie manuscrite/);
  assert.match(html, /ne crée pas d’ordonnance/);
  assert(!html.includes("Produit fictif"));
});
