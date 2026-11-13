import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { browserHarness } from "./browser-harness.mjs";

const directory = process.env.SIJ_AUDIT_DIR;
const harness = browserHarness({ port: 3130 });
const viewports = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};
const day = "2026-11-24";
const longName = "Démonstration-Alexandrie-Montgomery-Les-Oliviers";
const metrics = [];

async function capture(page, name, target) {
  if (target) await target.waitFor();
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const bounds = dialog?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      dialogFits: bounds ? bounds.top >= 0 && bounds.bottom <= window.innerHeight && bounds.left >= 0 && bounds.right <= window.innerWidth : null,
    };
  });
  metrics.push({ name, ...layout });
  if (directory) {
    await page.screenshot({ path: path.join(directory, name + ".png"), animations: "disabled" });
    if (target && !(await target.boundingBox().then(box => box && box.y >= 0 && box.y < page.viewportSize().height))) {
      await target.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(directory, name + "-detail.png"), animations: "disabled" });
    }
  }
  assert.equal(layout.overflow, 0, name + " page overflow");
  assert.notEqual(layout.dialogFits, false, name + " dialog outside viewport");
}

async function open(page, route, name, target) {
  await page.goto(harness.baseURL + route);
  await capture(page, name, target ?? page.locator("main h1").first());
}

async function create(context, route, data) {
  const csrfResponse = await context.request.get(harness.baseURL + "/api/v1/auth/csrf");
  assert.equal(csrfResponse.status(), 200);
  const { headerName, token } = await csrfResponse.json();
  const response = await context.request.post(harness.baseURL + "/api/v1" + route, {
    headers: { [headerName]: token }, data,
  });
  assert.equal(response.status(), 201, route);
  return response.json();
}

function patient(context, name) {
  return create(context, "/patients", { status: "active", identity: {
    firstName: "Patient fictif", lastName: name, sex: "unanswered", dateOfBirth: null,
    address: "", gsm: "", landline: "", profession: "", cin: "", medicalCoverage: "",
  } });
}

test("authenticated layouts, dense patient data, and keyboard navigation fit clinic viewports", async () => {
  if (directory) await mkdir(directory, { recursive: true });
  await harness.start();
  try {
    const guest = await harness.context({ anonymous: true, viewport: viewports.mobile });
    const { page: login } = guest;
    await open(login, "/login", "guest-mobile-login", login.getByRole("button", { name: "Se connecter" }));
    await login.getByRole("button", { name: "Se connecter" }).click();
    await capture(login, "guest-mobile-login-validation", login.locator("#identifier-error"));
    assert.equal(await login.locator("#identifier").getAttribute("aria-describedby"), "identifier-error");
    await login.getByLabel(/Mot de passe \(obligatoire\)/).fill("saisie-fictive");
    await login.getByRole("button", { name: "Afficher le mot de passe" }).click();
    assert.equal(await login.locator("#password").getAttribute("type"), "text");
    for (const [size, viewport] of Object.entries(viewports)) {
      if (size === "mobile") continue;
      await login.setViewportSize(viewport);
      await open(login, "/login", "guest-" + size + "-login", login.getByRole("button", { name: "Se connecter" }));
    }
    await guest.value.close();

    const seed = await harness.context({ viewport: viewports.desktop });
    const emptySearch = seed.page.getByRole("searchbox", { name: "Rechercher un patient" });
    await seed.page.goto(harness.baseURL + "/patients");
    await emptySearch.fill("AucunResultatSynthétique93");
    await capture(seed.page, "dentist-desktop-directory-loading", seed.page.getByText("Chargement des patients…", { exact: true }));
    await capture(seed.page, "dentist-desktop-directory-empty", seed.page.getByText("Aucun patient ne correspond à cette recherche."));
    const owner = await patient(seed.value, longName);
    for (let index = 0; index < 21; index++) await patient(seed.value, "Relevé fictif " + index);
    const appointment = await create(seed.value, "/appointments", {
      patientId: owner.id, startAt: day + "T09:00:00Z", endAt: day + "T09:30:00Z", type: "CONSULTATION",
    });
    let consultation = await create(seed.value, "/consultations", { patientId: owner.id, content: {
      appointmentId: null, consultationDate: day, chiefComplaint: "Examen fictif", clinicalObservations: "",
      assessment: "", treatmentPlan: "", notes: "",
    } });
    for (const [index, description] of ["Soin synthétique", "Deuxième soin de démonstration"].entries()) {
      const csrf = await (await seed.value.request.get(harness.baseURL + "/api/v1/auth/csrf")).json();
      const response = await seed.value.request.post(harness.baseURL + "/api/v1/consultations/" + consultation.id + "/treatments?patientId=" + owner.id, {
        headers: { [csrf.headerName]: csrf.token },
        data: { version: consultation.version, content: { treatmentDate: day, description, toothReference: "16 / 17 / 18 / 21 / 22 / 23", notes: "" } },
      });
      assert.equal(response.status(), 200);
      consultation = await response.json();
      await create(seed.value, "/financial/charges", {
        patientId: owner.id, consultationId: consultation.id, treatmentId: consultation.treatments.find(row => row.content.description === description).id,
        expectedConsultationVersion: consultation.version, priceMinor: index ? 35000 : 12500000,
      });
    }
    const insurance = await create(seed.value, "/insurance-documents", {
      patientId: owner.id, documentType: "CNOPS_DENTAIRE", templateVersion: 1, purpose: "ENTENTE_PREALABLE",
      draft: {
        fields: { cnops: { registrationNumber: "AFFILIATION-SYNTHETIQUE-2026-12345678901234567890" } },
        acts: Array.from({ length: 9 }, () => ({ fields: { plannedDescription: "Soin de démonstration" } })),
      },
    });
    const prescription = await create(seed.value, "/prescriptions", { patientId: owner.id, content: {
      consultationId: consultation.id, issuedDate: day, generalInstructions: "Consigne de démonstration", medications: [],
    } });
    await seed.value.close();

    const patientPath = "/patients/" + owner.id;
    const query = "?patientId=" + owner.id;
    const consultationPath = "/consultations/" + consultation.id;
    const prescriptionPath = "/documents/ordonnances/" + prescription.id;
    for (const [size, viewport] of Object.entries(viewports)) {
      for (const role of ["dentist", "receptionist"]) {
        const { page, value, errors } = await harness.context({ role, viewport });
        const name = (state) => [role, size, state].join("-");
        try {
          if (role === "dentist") await open(page, "/", name("dashboard"), page.getByText("Aucun rendez-vous pour cette période."));
          await open(page, "/patients", name("directory"), page.getByRole("link", { name: new RegExp(longName) }));
          await open(page, "/rendez-vous?date=" + day + "&view=" + (size === "desktop" ? "day" : "week"), name("calendar"),
            page.getByRole("status").filter({ hasText: "1 rendez-vous sur cette période" }));
          if (size === "desktop" && role === "dentist") {
            await open(page, "/rendez-vous?date=" + day + "&view=week", name("calendar-week"),
              page.getByRole("status").filter({ hasText: "1 rendez-vous sur cette période" }));
          }
          if (size === "mobile") {
            await page.goto(harness.baseURL + "/patients");
            const directoryTable = page.getByRole("region", { name: "Annuaire des patients" });
            await directoryTable.focus();
            assert(await directoryTable.evaluate(element => element.matches(":focus-visible")));
            await page.keyboard.press("ArrowRight");
            await page.waitForFunction(() => document.activeElement.scrollLeft > 0);
            await page.goto(harness.baseURL + "/rendez-vous?date=" + day + "&view=week");
            const menu = page.getByRole("button", { name: "Ouvrir le menu de navigation" });
            await menu.focus();
            await page.keyboard.press("Enter");
            const drawer = page.getByRole("dialog", { name: "Navigation du cabinet" });
            await capture(page, name("navigation"), drawer);
            assert.equal(await drawer.getByRole("link", { name: "Consultations" }).count(), role === "dentist" ? 1 : 0);
            await page.keyboard.press("Escape");
            await drawer.waitFor({ state: "hidden" });
            assert(await menu.evaluate(element => element === document.activeElement), "Focus returns to the menu trigger");
          }
          if (size !== "desktop" && size !== "mobile") continue;
          await open(page, patientPath, name("patient"), page.getByRole("heading", { name: new RegExp(longName) }));
          await open(page, "/patients/nouveau", name("patient-wizard"));
          await page.getByRole("button", { name: "Continuer" }).click();
          await capture(page, name("patient-validation"), page.locator("main [role=alert]").first());
          await open(page, "/rendez-vous/nouveau" + query + "&date=" + day, name("appointment-form"), page.getByLabel("Heure du cabinet"));
          await open(page, "/rendez-vous/" + appointment.id + "/modifier", name("appointment-edit"), page.getByLabel("Heure du cabinet"));
          await open(page, patientPath + "/finances", name("finances"), page.getByRole("table").first());
          await page.getByRole("button", { name: /Ouvrir le soin Soin synthétique/ }).click();
          await capture(page, name("payment"), page.getByLabel("Montant reçu (DH)"));
          await open(page, "/facturation", name("billing"));
          await open(page, patientPath + "/factures", name("invoice-history"), page.getByText(/Aucune facture/).first());
          await open(page, "/facturation/nouvelle" + query, name("invoice-selection"), page.getByRole("checkbox").first());
          if (role === "dentist") {
            await open(page, patientPath + "/dossier", name("questionnaire"), page.getByText("Dossier de santé · Accès réservé au dentiste."));
            assert.equal(await page.getByText(/Prototype destiné au dentiste/).count(), 0);
            await open(page, "/consultations", name("consultations"));
            await open(page, consultationPath + query, name("consultation-treatments"), page.getByText("Référence dentaire : 16 / 17 / 18 / 21 / 22 / 23").first());
            await open(page, consultationPath + "/modifier" + query, name("consultation-edit"), page.getByLabel(/Motif de consultation/));
            await open(page, "/documents" + query, name("prescriptions"));
            await open(page, prescriptionPath + "/modifier" + query, name("prescription-edit"), page.getByRole("button", { name: "Ajouter un médicament" }));
            await open(page, patientPath + "/assurances", name("insurance-history"), page.getByRole("heading", { name: /CNOPS/ }));
            if (size === "mobile") {
              await page.setViewportSize({ width: viewport.width, height: 500 });
              await page.goto(harness.baseURL + "/documents/assurances/" + insurance.documentId + query);
              const prepare = page.getByRole("button", { name: "Finaliser", exact: true });
              await prepare.click();
              const dialog = page.getByRole("dialog", { name: "Finaliser le document" });
              await capture(page, name("insurance-short-dialog"), dialog);
              const cancel = dialog.getByRole("button", { name: "Annuler" });
              const confirm = dialog.getByRole("button", { name: "Confirmer la finalisation" });
              assert(await confirm.isDisabled());
              const beforeScroll = await cancel.boundingBox();
              const review = dialog.getByRole("region", { name: "Détails de la confirmation" });
              await review.focus();
              await page.keyboard.press("PageDown");
              await page.waitForFunction(() => document.activeElement.scrollTop > 0);
              assert.deepEqual(await cancel.boundingBox(), beforeScroll, "Actions stay visible while the review scrolls");
              await page.keyboard.press("Escape");
              await dialog.waitFor({ state: "hidden" });
              assert(await prepare.evaluate(element => element === document.activeElement));
              await page.setViewportSize(viewport);
            }
            for (const [type, purpose] of [["CNSS", "ENTENTE_PREALABLE"], ["CNOPS", "ENTENTE_PREALABLE"], ["FAR", "DEVIS"]]) {
              await page.goto(harness.baseURL + "/documents/assurances/nouvelle" + query);
              await page.getByLabel("Organisme").selectOption(type + "_DENTAIRE");
              await page.getByLabel("Objet du document").selectOption(purpose);
              await page.getByRole("button", { name: "Ouvrir le formulaire" }).click();
              await capture(page, name("insurance-" + type.toLowerCase()), page.getByRole("button", { name: "Ajouter un acte" }));
            }
            if (size === "mobile") {
              await open(page, "/introuvable-phase-93", name("not-found"), page.getByRole("heading", { name: "Page introuvable" }));
              assert.equal(await page.getByRole("banner").count(), 1);
              assert.equal(await page.getByRole("main").count(), 1);
              assert.equal(await page.getByText(/Démonstration : données fictives/).count(), 0);
            }
          }
          assert.deepEqual(errors, []);
        } finally {
          await value.close();
        }
      }
    }
  } finally {
    if (directory) await writeFile(path.join(directory, "layout.json"), JSON.stringify(metrics, null, 2));
    await harness.stop();
  }
});
