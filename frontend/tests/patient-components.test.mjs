import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PatientDirectoryResults } from "../src/components/patients/patient-directory-results.tsx";
import { PatientIdentitySummary } from "../src/components/patients/patient-identity-summary.tsx";
import { PatientNotFound } from "../src/components/patients/patient-states.tsx";
import { TreatmentTable } from "../src/components/patients/treatment-table.tsx";
import {
  PatientClinicalSections,
  answerLabel,
} from "../src/components/patients/patient-clinical-sections.tsx";
import { patientFixtures } from "../src/data/patients.ts";
import { formatMAD } from "../src/lib/format.ts";

const query = {
  search: "",
  status: "all",
  sort: "name",
  page: 1,
  pageSize: 10,
};
function directory(state, overrides = {}) {
  return renderToStaticMarkup(
    createElement(PatientDirectoryResults, {
      state,
      query: { ...query, ...overrides },
      retry() {},
      changePage() {},
      clearFilters() {},
    }),
  );
}

test("directory renders populated, empty, no-result, loading and recoverable-error states", () => {
  const populated = directory({ status: "ready", data: patientFixtures });
  assert.match(populated, /Annuaire des patients/);
  assert.match(populated, /Page 1 sur 2/);
  assert.match(populated, /href="\/patients\/patient-demo-/);
  assert.match(
    directory({ status: "ready", data: [] }),
    /Aucun patient pour le moment/,
  );
  assert.match(
    directory(
      { status: "ready", data: patientFixtures },
      { search: "unfindable" },
    ),
    /Aucun résultat/,
  );
  assert.match(directory({ status: "loading" }), /role="status"/);
  const error = directory({ status: "error" });
  assert.match(error, /role="alert"/);
  assert.match(error, /Réessayer/);
});

test("administrative markup excludes medical answers, CIN, and clinical history", () => {
  const patient = structuredClone(patientFixtures[2]);
  patient.identity.cin = "PRIVATE-CIN-SENTINEL";
  patient.healthQuestionnaire.additionalInformation = "PRIVATE-HEALTH-SENTINEL";
  const markup = directory({ status: "ready", data: [patient] });
  assert(!markup.includes("PRIVATE-CIN-SENTINEL"));
  assert(!markup.includes("PRIVATE-HEALTH-SENTINEL"));
  assert(!markup.includes("Antécédents médicaux"));
  const identity = renderToStaticMarkup(
    createElement(PatientIdentitySummary, { identity: patient.identity }),
  );
  assert(!identity.includes("PRIVATE-CIN-SENTINEL"));
  assert.match(identity, /masquée/);
  assert(!identity.includes("PRIVATE-HEALTH-SENTINEL"));
});

test("health answers preserve unanswered versus No and categories are reported rather than inferred", () => {
  assert.equal(answerLabel("unanswered"), "Non renseigné");
  assert.equal(answerLabel("no"), "Non");
  assert.equal(answerLabel("yes"), "Oui");
  const markup = renderToStaticMarkup(
    createElement(PatientClinicalSections, { patient: patientFixtures[0] }),
  );
  assert.match(markup, /Non renseigné/);
  assert.match(markup, /Prototype destiné au dentiste/);
  assert.match(markup, /Maladie du sang/);
  assert.match(markup, /Appareil gastrique/);
  assert.match(markup, /Antibiotique/);
  assert.match(markup, /Non coché/);
});

test("treatment table is read-only, uses the paper columns and exact centime subtraction", () => {
  const entries = [
    {
      id: "example",
      date: "2026-11-07",
      treatment: "Traitement fictif",
      priceCentimes: 10001,
      receivedCentimes: 4000,
    },
  ];
  const markup = renderToStaticMarkup(
    createElement(TreatmentTable, { entries }),
  );
  for (const name of ["Date", "Traitement", "Prix", "Reçu", "Reste"])
    assert(markup.includes(`>${name}</th>`));
  assert(markup.includes(formatMAD(6001)));
  assert.match(markup, /Prototype en lecture seule/);
  assert(!markup.includes("<input"));
  assert(!markup.includes("<button"));
  const empty = renderToStaticMarkup(
    createElement(TreatmentTable, { entries: [] }),
  );
  assert.match(empty, /Aucun traitement fictif/);
});

test("unknown patient presentation offers a return path and explains temporary records", () => {
  const markup = renderToStaticMarkup(createElement(PatientNotFound));
  assert.match(markup, /Patient introuvable/);
  assert.match(markup, /href="\/patients"/);
  assert.match(markup, /rechargement/);
});
