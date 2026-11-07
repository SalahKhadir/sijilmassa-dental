import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdir } from "node:fs/promises";
import { browserHarness } from "./browser-harness.mjs";
const harness = browserHarness({ port: 3102 });
const baseURL = harness.baseURL;
before(harness.start);
after(harness.stop);
const heading = (page, name) =>
  page.getByRole("heading", { name, exact: true }).waitFor();
const mainLink = (page, name) =>
  page.locator("main").getByRole("link", { name, exact: true });
async function screenshot(page, name) {
  const directory =
    process.env.CLINICAL_TEST_SCREENSHOT_DIR ??
    path.join(tmpdir(), "sijilmassa-clinical-phase5");
  await mkdir(directory, { recursive: true });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(directory, `${name}.png`),
    fullPage: true,
  });
}
test("clinical encounter from appointment, treatments, draft edits, completion and shared patient history", async () => {
  const { value, page, errors, external } = await harness.context();
  try {
    await page.goto(`${baseURL}/rendez-vous/appointment-demo-001`);
    await heading(page, "Détails du rendez-vous");
    await mainLink(page, "Créer une consultation").click();
    await heading(page, "Nouvelle consultation");
    assert.equal(
      await page
        .getByLabel("Patient (obligatoire)", { exact: true })
        .inputValue(),
      "patient-demo-001",
    );
    assert.equal(
      await page.getByLabel("Rendez-vous lié (facultatif)").inputValue(),
      "appointment-demo-001",
    );
    await page
      .getByRole("button", { name: "Créer le brouillon", exact: true })
      .click();
    await page
      .getByText("Indiquez le motif de consultation.", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByLabel("Motif de consultation (obligatoire)", { exact: true })
        .evaluate((node) => node === document.activeElement),
      true,
    );
    await page
      .getByLabel("Motif de consultation (obligatoire)", { exact: true })
      .fill("Rencontre fictive du parcours clinique");
    await page
      .getByLabel("Observations cliniques (facultatif)")
      .fill("Observations fictives du test navigateur");
    await page
      .getByRole("button", { name: "Ajouter un soin", exact: true })
      .click();
    await page
      .getByLabel("Description (obligatoire)", { exact: true })
      .fill("Premier soin fictif consigné");
    await page
      .getByLabel("Référence dentaire (facultatif)", { exact: true })
      .fill("11 / 12");
    await page
      .getByRole("button", { name: "Ajouter un soin", exact: true })
      .click();
    await page
      .getByLabel("Description (obligatoire)", { exact: true })
      .nth(1)
      .fill("Soin à retirer avant enregistrement");
    await page
      .getByRole("button", { name: "Retirer ce soin non enregistré" })
      .nth(1)
      .click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    assert.equal(
      await page
        .getByLabel("Description (obligatoire)", { exact: true })
        .count(),
      2,
    );
    await page
      .getByRole("button", { name: "Retirer ce soin non enregistré" })
      .nth(1)
      .click();
    await page
      .getByRole("button", { name: "Retirer le soin", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Description (obligatoire)", { exact: true })
        .count(),
      1,
    );
    await page
      .getByRole("button", { name: "Ajouter un soin", exact: true })
      .click();
    await page
      .getByLabel("Description (obligatoire)", { exact: true })
      .nth(1)
      .fill("Second soin fictif consigné");
    await screenshot(page, "consultation-form-desktop");
    await page
      .getByRole("button", { name: "Créer le brouillon", exact: true })
      .click();
    await mainLink(page, "Modifier le brouillon").waitFor();
    assert.match(
      await page.getByRole("status").innerText(),
      /créée en brouillon/,
    );
    const consultationURL = page.url();
    assert.match(consultationURL, /consultation-demo-021$/);
    await mainLink(page, "Modifier le brouillon").click();
    await heading(page, "Modifier le brouillon");
    assert.equal(
      await page
        .getByLabel("Description (obligatoire)", { exact: true })
        .count(),
      2,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Retirer ce soin non enregistré" })
        .count(),
      0,
    );
    await page
      .getByLabel("Description (obligatoire)", { exact: true })
      .first()
      .fill("Premier soin fictif corrigé");
    await page
      .getByLabel("Notes complémentaires (facultatif)")
      .fill("Note clinique privée fictive");
    await page
      .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
      .click();
    await mainLink(page, "Modifier le brouillon").waitFor();
    await page
      .getByText("Premier soin fictif corrigé", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Terminer la consultation", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    );
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    await page
      .getByRole("button", { name: "Terminer la consultation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmer la clôture", exact: true })
      .click();
    await page
      .getByText("Terminée · Compte rendu en lecture seule.", { exact: true })
      .waitFor();
    assert.equal(await mainLink(page, "Modifier le brouillon").count(), 0);
    await screenshot(page, "consultation-completed-desktop");
    await page.getByRole("link", { name: /Rendez-vous du/ }).click();
    await heading(page, "Détails du rendez-vous");
    await mainLink(page, "Ouvrir la consultation liée").waitFor();
    assert.equal(await mainLink(page, "Créer une consultation").count(), 0);
    assert(
      !(await page.locator("main").innerText()).includes(
        "Note clinique privée fictive",
      ),
    );
    assert.equal(
      await page.getByLabel("Nouveau statut").inputValue(),
      "CONFIRME",
    );
    await mainLink(page, "Modifier le rendez-vous").click();
    await page
      .getByLabel("Patient (obligatoire)", { exact: true })
      .selectOption("patient-demo-002");
    await page
      .getByRole("button", { name: "Enregistrer en mémoire", exact: true })
      .click();
    await page
      .getByText(
        "Ce rendez-vous est lié à une consultation. Son patient doit être conservé.",
        { exact: true },
      )
      .waitFor();
    await mainLink(page, "Annuler la saisie").click();
    await mainLink(page, "Ouvrir la consultation liée").click();
    await mainLink(page, "Voir le contexte médical").click();
    await page
      .getByRole("heading", { name: "Antécédents médicaux", exact: true })
      .waitFor();
    await page
      .getByText("Rencontre fictive du parcours clinique", { exact: true })
      .waitFor();
    await mainLink(page, "Retour au dossier patient").click();
    await heading(page, "Informations personnelles");
    assert(
      !(await page.locator("main").innerText()).includes(
        "Rencontre fictive du parcours clinique",
      ),
    );
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Tableau de bord", exact: true })
      .click();
    await heading(page, "Tableau de bord");
    assert(
      !(await page.locator("main").innerText()).includes(
        "Note clinique privée fictive",
      ),
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
      })),
      { local: [], session: [] },
    );
    assert.deepEqual(await value.cookies(), []);
    await page.goto(consultationURL);
    await heading(page, "Cette consultation est introuvable.");
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await value.close();
  }
});
test("walk-in validation, search filters, invalid links, readonly routes and responsive clinical overview", async () => {
  const { value, page, errors, external } = await harness.context({
    reducedMotion: "reduce",
  });
  try {
    await page.goto(`${baseURL}/consultations`);
    await heading(page, "Consultations");
    await page
      .getByRole("status")
      .filter({ hasText: "20 consultations affichées" })
      .waitFor();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await screenshot(page, `clinical-directory-${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel("Statut", { exact: true }).selectOption("BROUILLON");
    await page
      .getByRole("status")
      .filter({ hasText: "7 consultations affichées" })
      .waitFor();
    await page
      .getByLabel("Rechercher un patient", { exact: true })
      .fill("zzz-absent");
    await page.getByText(/Aucune consultation à afficher/).waitFor();
    await page.getByLabel("Rechercher un patient", { exact: true }).fill("");
    await page.getByLabel("Statut", { exact: true }).selectOption("all");
    await page.getByLabel("Trier par date").selectOption("oldest");
    assert.match(
      await page.locator("main ul li").first().innerText(),
      /05\/10\/2026/,
    );
    await mainLink(page, "Nouvelle consultation").click();
    await page
      .getByRole("button", { name: "Créer le brouillon", exact: true })
      .click();
    await page.getByText("Sélectionnez un patient.", { exact: true }).waitFor();
    await page
      .getByLabel("Rechercher un patient", { exact: true })
      .fill("MERIEM DEMO-IDRISSI");
    await page
      .getByLabel("Patient (obligatoire)", { exact: true })
      .selectOption("patient-demo-003");
    await page
      .getByLabel("Rechercher un patient", { exact: true })
      .fill("zz-absent");
    await page.getByText(/Aucun patient ne correspond/).waitFor();
    assert.equal(
      await page
        .getByLabel("Patient (obligatoire)", { exact: true })
        .inputValue(),
      "patient-demo-003",
    );
    // The seeded linked appointment is deliberately unavailable for duplicate creation.
    assert.equal(
      await page
        .getByLabel("Rendez-vous lié (facultatif)")
        .locator('option[value="appointment-demo-003"]')
        .count(),
      0,
    );
    await page
      .getByLabel("Motif de consultation (obligatoire)", { exact: true })
      .fill("Visite spontanée fictive");
    await page
      .getByRole("button", { name: "Créer le brouillon", exact: true })
      .click();
    await page
      .getByText("Visite spontanée · Sans rendez-vous lié", { exact: true })
      .waitFor();
    await mainLink(page, "Voir le contexte médical").click();
    await heading(page, "Historique des consultations");
    for (const width of [1440, 1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await screenshot(page, `clinical-patient-${width}`);
    }
    await mainLink(page, "Nouvelle consultation").click();
    await heading(page, "Nouvelle consultation");
    assert.equal(
      await page
        .getByLabel("Patient (obligatoire)", { exact: true })
        .inputValue(),
      "patient-demo-003",
    );
    await screenshot(page, "consultation-form-mobile");
    await page
      .getByLabel("Motif de consultation (obligatoire)", { exact: true })
      .focus();
    await page.keyboard.type("Saisie clinique fictive au clavier");
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .getByLabel("Observations cliniques (facultatif)")
        .evaluate((node) => node === document.activeElement),
      true,
    );
    assert(
      await page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    );
    const cases = [
      ["/consultations/missing", "Cette consultation est introuvable."],
      [
        "/consultations/missing/modifier",
        "Cette consultation est introuvable.",
      ],
      [
        "/consultations/consultation-demo-002/modifier",
        "Cette consultation terminée est en lecture seule.",
      ],
      [
        "/consultations/nouveau?patientId=missing",
        "Ce patient est introuvable.",
      ],
      ["/patients/missing/clinique", "Ce patient est introuvable."],
      [
        "/consultations/nouveau?patientId=patient-demo-001&appointmentId=appointment-demo-003",
        "Le lien de rendez-vous est invalide pour ce patient.",
      ],
      [
        "/consultations/nouveau?appointmentId=missing",
        "Le lien de rendez-vous est invalide pour ce patient.",
      ],
      [
        "/consultations/nouveau?appointmentId=appointment-demo-003",
        "Ce rendez-vous possède déjà une consultation.",
      ],
    ];
    for (const [route, title] of cases) {
      await page.goto(`${baseURL}${route}`);
      await heading(page, title);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await value.close();
  }
});
