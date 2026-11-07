import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConsultationList } from "../src/components/consultations/consultation-list.tsx";
import { TreatmentHistory } from "../src/components/consultations/treatment-history.tsx";
import { ConsultationStatus } from "../src/components/consultations/consultation-status.tsx";
import {
  ClinicalNotice,
  ClinicalLoading,
  ClinicalError,
  ClinicalMissing,
} from "../src/components/consultations/clinical-states.tsx";
import { PatientClinicalSections } from "../src/components/patients/patient-clinical-sections.tsx";
import { patientFixtures } from "../src/data/patients.ts";
import { consultationFixtures } from "../src/data/consultations.ts";
const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
test("clinical directory renders identity, date, status and care count without notes", () => {
  const html = render(ConsultationList, {
    records: consultationFixtures,
    patients: patientFixtures,
  });
  assert.match(html, /Brouillon/);
  assert.match(html, /Terminée/);
  assert.match(html, /soin/);
  for (const record of consultationFixtures) {
    assert(!html.includes(record.chiefComplaint));
    assert(!html.includes(record.notes));
  }
  assert.match(
    render(ConsultationList, { records: [], patients: [] }),
    /Aucune consultation/,
  );
  assert.match(
    render(ConsultationList, {
      records: [consultationFixtures[0]],
      patients: patientFixtures,
      clinicalHistory: true,
    }),
    /Visite de contrôle fictive/,
  );
});
test("medical summary renders reported allergies and yes no unanswered distinctly", () => {
  const patient = structuredClone(patientFixtures[0]);
  patient.medicalHistory = {
    reportStatus: "reported",
    conditions: ["Diabète"],
    otherDetails: "",
  };
  patient.allergies = {
    reportStatus: "reported",
    categories: ["Aspirine"],
    clarification: "Déclaration fictive",
  };
  patient.healthQuestionnaire.underMedicalTreatment = "no";
  patient.healthQuestionnaire.pregnant = "unanswered";
  let html = render(PatientClinicalSections, { patient, factualAnswers: true });
  for (const word of [
    "Cardiaque",
    "Ostéoporose",
    "Chirurgie",
    "Maladie du sang",
    "Diabète",
    "Sinusite",
    "Appareil gastrique",
    "Aspirine",
    "Antibiotique",
    "Anesthésie",
    "Aliment",
    "Oui",
    "Non",
    "Non renseigné",
    "Allergies rapportées",
  ])
    assert(html.includes(word));
  patient.medicalHistory = {
    reportStatus: "unanswered",
    conditions: [],
    otherDetails: "",
  };
  patient.allergies = {
    reportStatus: "unanswered",
    categories: [],
    clarification: "",
  };
  html = render(PatientClinicalSections, { patient, factualAnswers: true });
  assert(!html.includes("Allergies rapportées"));
  assert((html.match(/Non renseigné/g) ?? []).length > 12);
});
test("treatment history is chronological and separate from the financial ledger", () => {
  const record = structuredClone(consultationFixtures[1]);
  record.treatments.push({
    ...record.treatments[0],
    id: "older",
    treatmentDate: "2026-01-01",
    description: "Ancien soin",
    toothReference: "11",
  });
  const html = render(TreatmentHistory, { consultation: record });
  assert(
    html.indexOf("Ancien soin") <
      html.indexOf(record.treatments[0].description),
  );
  assert.match(html, /Référence dentaire 11/);
  assert(!html.includes("Prix"));
  assert(!html.includes("Reçu"));
  assert.match(
    render(TreatmentHistory, { consultation: consultationFixtures[0] }),
    /Aucun soin enregistré/,
  );
});
test("status icons and temporary loading error missing states remain explicit", () => {
  for (const status of ["BROUILLON", "TERMINEE"]) {
    const html = render(ConsultationStatus, { status });
    assert.match(html, /svg/);
    assert.match(html, /aria-hidden="true"/);
  }
  assert.match(render(ClinicalNotice), /futur backend/);
  assert.match(render(ClinicalLoading), /role="status"/);
  assert.match(render(ClinicalError, { retry() {} }), /Réessayer/);
  assert.match(render(ClinicalMissing), /introuvable/);
});

test("patient clinical history exposes recorded care in a native disclosure", () => {
  const html = render(ConsultationList, {
    records: [consultationFixtures[1]],
    patients: patientFixtures,
    clinicalHistory: true,
  });
  assert.match(html, /<details/);
  assert.match(html, /Consulter les soins enregistrés/);
  assert(html.includes(consultationFixtures[1].treatments[0].description));
});
