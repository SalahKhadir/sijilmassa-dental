import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { browserHarness } from "./browser-harness.mjs";
const harness = browserHarness({ port: 3103 });
const baseURL = harness.baseURL;
before(harness.start);
after(harness.stop);
const heading = (page, name) =>
  page.getByRole("heading", { name, exact: true }).waitFor();
const mainLink = (page, name) =>
  page.locator("main").getByRole("link", { name, exact: true });
async function pdf(page) {
  await mainLink(page, "Télécharger le PDF").waitFor();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent === "Imprimer le PDF",
      )?.disabled,
  );
  const href = await mainLink(page, "Télécharger le PDF").getAttribute("href");
  assert(href.startsWith("blob:"));
  const bytes = await page.evaluate(
    async (url) =>
      Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),
    href,
  );
  const document = await PDFDocument.load(new Uint8Array(bytes));
  assert.equal(document.getPageCount(), 1);
  assert.equal(document.getPages()[0].getWidth(), 419.25);
  return { bytes, document };
}
async function screenshot(page, name) {
  const directory =
    process.env.PRESCRIPTION_SCREENSHOT_DIR ??
    path.join(tmpdir(), "sijilmassa-prescriptions-phase6");
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
async function printRequest(page) {
  await page.evaluate(() => {
    window.__prescriptionPrintCalls = 0;
    document.querySelector('iframe[title*="Aperçu"]').contentWindow.print =
      () => {
        window.__prescriptionPrintCalls += 1;
      };
  });
  await page
    .getByRole("button", { name: "Imprimer le PDF", exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.__prescriptionPrintCalls), 1);
  await page
    .getByRole("status")
    .filter({ hasText: /demande d’impression/ })
    .waitFor();
}
test("blank official PDF previews downloads and requests printing without creating a record", async () => {
  const { value, page, errors, external } = await harness.context();
  try {
    await page.goto(`${baseURL}/documents`);
    await heading(page, "Documents");
    await page
      .getByRole("status")
      .filter({ hasText: "8 ordonnances affichées" })
      .waitFor();
    await heading(page, "Feuilles de soins dentaires (CNSS, CNOPS, FAR)");
    assert.equal(
      await page
        .getByRole("button", { name: /remplir|générer.*CNSS/i })
        .count(),
      0,
    );
    await mainLink(page, "Imprimer une ordonnance vierge").click();
    await heading(page, "Ordonnance vierge A5");
    const generated = await pdf(page);
    assert.deepEqual(
      Buffer.from(generated.bytes),
      await readFile("../docs/references/pdf-templates/ordonnance-a5.pdf"),
    );
    const download = page.waitForEvent("download");
    await mainLink(page, "Télécharger le PDF").click();
    assert.equal(
      (await download).suggestedFilename(),
      "ordonnance-vierge-a5.pdf",
    );
    await printRequest(page);
    await screenshot(page, "blank-preview-desktop");
    await mainLink(page, "Retour aux documents").click();
    await page
      .getByRole("status")
      .filter({ hasText: "8 ordonnances affichées" })
      .waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await value.close();
  }
});
test("patient and consultation entry points preserve valid links through draft editing and explicit finalization", async () => {
  const { value, page, errors, external } = await harness.context();
  try {
    await page.goto(`${baseURL}/consultations/consultation-demo-001`);
    await mainLink(page, "Créer une ordonnance").click();
    await heading(page, "Nouvelle ordonnance");
    assert.equal(
      await page
        .getByLabel("Patient (obligatoire)", { exact: true })
        .inputValue(),
      "patient-demo-001",
    );
    assert.equal(
      await page.getByLabel("Consultation liée (facultatif)").inputValue(),
      "consultation-demo-001",
    );
    await page
      .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
      .click();
    await mainLink(page, "Modifier le brouillon").waitFor();
    await pdf(page);
    await page
      .getByRole("button", { name: "Finaliser l’ordonnance", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmer la finalisation", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Ajoutez au moins un médicament" })
      .waitFor();
    await page.keyboard.press("Escape");
    await mainLink(page, "Modifier le brouillon").click();
    await page
      .getByRole("button", { name: "Ajouter un médicament", exact: true })
      .click();
    await page
      .getByLabel("Nom du médicament", { exact: true })
      .fill("Produit fictif A — exemple");
    await page
      .getByLabel("Posologie", { exact: true })
      .fill("Saisie fictive du dentiste");
    await page
      .getByLabel("Fréquence", { exact: true })
      .fill("Fréquence fictive");
    await page.getByLabel("Durée", { exact: true }).fill("Durée fictive");
    await page
      .getByLabel("Instructions complémentaires", { exact: true })
      .fill("Texte fictif accentué : été et cœur.");
    await page
      .getByRole("button", { name: "Ajouter un médicament", exact: true })
      .click();
    await page
      .getByLabel("Nom du médicament", { exact: true })
      .nth(1)
      .fill("Ligne fictive à retirer");
    await page
      .getByRole("button", { name: "Monter le médicament 2", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Nom du médicament", { exact: true })
        .first()
        .inputValue(),
      "Ligne fictive à retirer",
    );
    await page
      .getByRole("button", { name: "Retirer le médicament 1", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retirer la ligne", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
      .click();
    await mainLink(page, "Modifier le brouillon").waitFor();
    const url = page.url();
    assert.equal(
      (await pdf(page)).document.getTitle(),
      "Ordonnance - BROUILLON",
    );
    await mainLink(page, "Modifier le brouillon").click();
    await page
      .getByLabel("Instructions générales (facultatif)")
      .fill("Instruction générale fictive corrigée.");
    await page
      .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
      .click();
    await mainLink(page, "Modifier le brouillon").waitFor();
    await page
      .getByRole("button", { name: "Finaliser l’ordonnance", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    assert(
      await page
        .getByRole("dialog")
        .evaluate((node) => node.contains(document.activeElement)),
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page
      .getByRole("button", { name: "Finaliser l’ordonnance", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmer la finalisation", exact: true })
      .click();
    await page
      .getByText("Finalisée · Document en lecture seule.", { exact: true })
      .waitFor();
    assert.equal(await mainLink(page, "Modifier le brouillon").count(), 0);
    assert.equal((await pdf(page)).document.getTitle(), "Ordonnance");
    await printRequest(page);
    const download = page.waitForEvent("download");
    await mainLink(page, "Télécharger le PDF").click();
    assert((await download).suggestedFilename().includes("finalisee"));
    await screenshot(page, "finalized-desktop");
    await mainLink(page, "Voir la consultation liée").click();
    await mainLink(page, "Modifier le brouillon").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Terminer la consultation", exact: true })
        .count(),
      1,
    );
    await mainLink(page, "Voir le contexte médical").click();
    await heading(page, "Ordonnances · Espace dentiste");
    await mainLink(page, "Nouvelle ordonnance").click();
    await heading(page, "Nouvelle ordonnance");
    assert.equal(
      await page
        .getByLabel("Patient (obligatoire)", { exact: true })
        .inputValue(),
      "patient-demo-001",
    );
    assert.equal(
      await page.getByLabel("Consultation liée (facultatif)").inputValue(),
      "",
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
      })),
      { local: [], session: [] },
    );
    assert((await value.cookies()).every(cookie => cookie.name === "JSESSIONID" && cookie.httpOnly));
    await page.goto(url);
    await heading(page, "Cette ordonnance est introuvable.");
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await value.close();
  }
});
test("documents filters mobile layout keyboard and invalid links are explicit", async () => {
  const { value, page, errors, external } = await harness.context({
    reducedMotion: "reduce",
  });
  try {
    await page.goto(`${baseURL}/documents`);
    await heading(page, "Documents");
    await page
      .getByRole("status")
      .filter({ hasText: "8 ordonnances affichées" })
      .waitFor();
    for (const width of [1440, 1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await screenshot(page, `documents-${width}`);
    }
    await page.getByLabel("Statut", { exact: true }).selectOption("FINALISEE");
    await page
      .getByRole("status")
      .filter({ hasText: "4 ordonnances affichées" })
      .waitFor();
    await page.getByLabel("Du", { exact: true }).fill("2026-11-07");
    await page.getByLabel("Au", { exact: true }).fill("2026-11-01");
    await page
      .getByRole("alert")
      .filter({ hasText: "La date de fin" })
      .waitFor();
    await page
      .getByRole("button", { name: "Réinitialiser les filtres" })
      .click();
    await page
      .getByLabel("Rechercher un patient", { exact: true })
      .fill("absent-xyz");
    await page.getByText(/Aucune ordonnance à afficher/).waitFor();
    await mainLink(page, "Nouvelle ordonnance").click();
    await page
      .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
      .click();
    await page.getByText("Sélectionnez un patient.", { exact: true }).waitFor();
    assert(
      await page
        .getByLabel("Patient (obligatoire)", { exact: true })
        .evaluate((node) => node === document.activeElement),
    );
    await page
      .getByLabel("Rechercher un patient", { exact: true })
      .fill("MERIEM DEMO-IDRISSI");
    await page
      .getByLabel("Patient (obligatoire)", { exact: true })
      .selectOption("patient-demo-003");
    await page
      .getByLabel("Date de l’ordonnance (obligatoire)", { exact: true })
      .fill("2026-01-01");
    await page.getByText(/La date choisie est antérieure/).waitFor();
    await page
      .getByRole("button", { name: "Ajouter un médicament", exact: true })
      .click();
    await page.getByLabel("Nom du médicament", { exact: true }).focus();
    await page.keyboard.type("Produit fictif mobile");
    await page.keyboard.press("Tab");
    assert(
      await page
        .getByLabel("Posologie", { exact: true })
        .evaluate((node) => node === document.activeElement),
    );
    await screenshot(page, "editor-mobile");
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    for (const [route, title] of [
      ["/documents/ordonnances/missing", "Cette ordonnance est introuvable."],
      [
        "/documents/ordonnances/missing/modifier",
        "Cette ordonnance est introuvable.",
      ],
      [
        "/documents/ordonnances/prescription-demo-002/modifier",
        "Cette ordonnance finalisée est en lecture seule.",
      ],
      [
        "/documents/ordonnances/nouvelle?patientId=missing",
        "Ce patient est introuvable.",
      ],
      [
        "/documents/ordonnances/nouvelle?patientId=patient-demo-001&consultationId=consultation-demo-002",
        "Le lien de consultation est invalide pour ce patient.",
      ],
      [
        "/documents/ordonnances/nouvelle?consultationId=missing",
        "Le lien de consultation est invalide pour ce patient.",
      ],
    ]) {
      await page.goto(`${baseURL}${route}`);
      await heading(page, title);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await value.close();
  }
});
