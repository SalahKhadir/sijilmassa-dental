import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdir } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { browserHarness } from "./browser-harness.mjs";
import { formatMinor } from "../../src/lib/billing/money.ts";

const harness = browserHarness({ port: 3104 });
before(harness.start);
after(harness.stop);
const link = (page, name) =>
  page.locator("main").getByRole("link", { name, exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const heading = (page, name) =>
  page.getByRole("heading", { name, exact: true }).waitFor();
async function screenshot(page, name) {
  await mkdir("/tmp/sijilmassa-billing-phase7", { recursive: true });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `/tmp/sijilmassa-billing-phase7/${name}.png`,
    fullPage: true,
  });
}
async function payment(page, amount) {
  await page.getByLabel("Montant en DH (obligatoire)").fill(amount);
  await button(page, "Vérifier le règlement").click();
  await page.getByRole("dialog").waitFor();
  await button(page, "Confirmer le règlement").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function invoicePdf(page) {
  await link(page, "Télécharger le PDF").waitFor();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find(
        (item) => item.textContent === "Imprimer",
      )?.disabled,
  );
  const href = await link(page, "Télécharger le PDF").getAttribute("href");
  assert(href.startsWith("blob:"));
  const bytes = await page.evaluate(
    async (url) =>
      Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),
    href,
  );
  const document = await PDFDocument.load(new Uint8Array(bytes));
  assert.equal(document.getPageCount(), 1);
  assert(Math.abs(document.getPage(0).getWidth() - 419.5276) < 0.01);
  return document;
}
test("consultation invoice permits price override and exact partial payments shared across patient and dashboard", async () => {
  const { value, page, errors, external } = await harness.context();
  try {
    await page.goto(`${harness.baseURL}/demo/consultations/consultation-demo-001`);
    await link(page, "Créer une facture").click();
    await heading(page, "Nouvelle facture");
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
      .getByLabel("Catalogue facultatif · Données fictives")
      .selectOption({ index: 2 });
    await button(page, "Ajouter la prestation").click();
    assert.equal(
      await page.getByLabel("Prix de l’acte en DH (obligatoire)").inputValue(),
      "400,00",
    );
    await page.getByLabel("Prix de l’acte en DH (obligatoire)").fill("350");
    await button(page, "Ajouter une ligne personnalisée").click();
    await page
      .getByLabel("Désignation de l’acte (obligatoire)")
      .nth(1)
      .fill("Prestation complémentaire fictive");
    await page
      .getByLabel("Prix de l’acte en DH (obligatoire)")
      .nth(1)
      .fill("600,00");
    await button(page, "Monter la ligne 2").click();
    assert.equal(
      await page
        .getByLabel("Désignation de l’acte (obligatoire)")
        .first()
        .inputValue(),
      "Prestation complémentaire fictive",
    );
    await button(page, "Enregistrer le brouillon").click();
    await heading(page, "Brouillon de facture");
    assert.equal((await invoicePdf(page)).getTitle(), "Facture - BROUILLON");
    const url = page.url();
    await link(page, "Modifier le brouillon").click();
    assert.equal(
      await page
        .getByLabel("Prix de l’acte en DH (obligatoire)")
        .nth(1)
        .inputValue(),
      "350,00",
    );
    await button(page, "Ajouter une ligne personnalisée").click();
    await button(page, "Retirer la ligne 3").click();
    await button(page, "Retirer la ligne").click();
    await button(page, "Enregistrer le brouillon").click();
    await button(page, "Émettre la facture").click();
    assert(
      await page
        .getByRole("dialog")
        .evaluate((node) => node.contains(document.activeElement)),
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await button(page, "Émettre la facture").click();
    await button(page, "Confirmer l’émission").click();
    await heading(page, "Facture 2026-011");
    assert.equal((await invoicePdf(page)).getTitle(), "Facture 2026-011");
    const download = page.waitForEvent("download");
    await link(page, "Télécharger le PDF").click();
    assert.equal((await download).suggestedFilename(), "facture-2026-011.pdf");
    await page.evaluate(() => {
      window.__invoicePrintCalls = 0;
      document.querySelector(
        'iframe[title="Aperçu PDF de la facture"]',
      ).contentWindow.print = () => {
        window.__invoicePrintCalls += 1;
      };
    });
    await button(page, "Imprimer").click();
    assert.equal(await page.evaluate(() => window.__invoicePrintCalls), 1);
    assert.equal(await link(page, "Modifier le brouillon").count(), 0);
    await payment(page, "400");
    await page.getByText("Partiellement payée", { exact: true }).waitFor();
    await payment(page, "300");
    await page
      .getByText(`Reste à encaisser · ${formatMinor(25000)}`, { exact: true })
      .waitFor();
    await page.getByLabel("Montant en DH (obligatoire)").fill("300");
    await button(page, "Vérifier le règlement").click();
    await page
      .getByRole("alert")
      .filter({ hasText: /dépasse/ })
      .waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await screenshot(page, "invoice-partial-desktop");
    await page.setViewportSize({ width: 390, height: 900 });
    await screenshot(page, "invoice-partial-mobile");
    await payment(page, "250");
    await page.getByText("Payée", { exact: true }).waitFor();
    assert.equal(await button(page, "Annuler la facture").count(), 0);
    assert.equal(await button(page, "Vérifier le règlement").count(), 0);
    await link(page, "Voir le dossier patient").click();
    await heading(page, "Historique financier");
    const financial = page.locator('[data-slot="card"]').filter({
      has: page.getByRole("heading", {
        name: "Historique financier",
        exact: true,
      }),
    });
    assert((await financial.innerText()).includes("2026-011"));
    assert((await financial.innerText()).includes(formatMinor(95000)));
    // Follow a client-side shell link to preserve the shared in-memory ledger.
    await page
      .getByRole("link", { name: "Tableau de bord synthétique", exact: true })
      .first()
      .click();
    await heading(page, "Tableau de bord");
    await page.getByText(formatMinor(590000), { exact: true }).waitFor();
    await page.getByText(formatMinor(950000), { exact: true }).waitFor();
    assert.deepEqual(
      await page.evaluate(() => [
        Object.keys(localStorage),
        Object.keys(sessionStorage),
      ]),
      [[], []],
    );
    assert((await value.cookies()).every(cookie => cookie.name === "JSESSIONID" && cookie.httpOnly));
    await page.goto(url);
    await heading(page, "Cette facture est introuvable.");
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await value.close();
  }
});
test("billing directory filters pagination responsive keyboard errors and unpaid cancellation", async () => {
  const { value, page, errors, external } = await harness.context({
    reducedMotion: "reduce",
  });
  try {
    await page.goto(`${harness.baseURL}/facturation`);
    await page
      .getByRole("status")
      .filter({ hasText: "13 factures affichées" })
      .waitFor();
    await button(page, "Suivant").click();
    await page.getByText("Page 2 sur 2", { exact: true }).waitFor();
    await button(page, "Précédent").click();
    for (const width of [1440, 1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await screenshot(page, `directory-${width}`);
    }
    await page
      .getByLabel("Statut", { exact: true })
      .selectOption("PARTIELLEMENT_PAYEE");
    await page
      .getByRole("status")
      .filter({ hasText: "3 factures affichées" })
      .waitFor();
    await page.getByLabel("Du", { exact: true }).fill("2026-11-07");
    await page.getByLabel("Au", { exact: true }).fill("2026-11-01");
    await page
      .getByRole("alert")
      .filter({ hasText: "La date de fin" })
      .waitFor();
    await button(page, "Réinitialiser les filtres").click();
    await page
      .getByLabel("Rechercher une facture ou un patient")
      .fill("absent-xyz");
    await page.getByText(/Aucune facture à afficher/).waitFor();
    await link(page, "Nouvelle facture").click();
    await button(page, "Enregistrer le brouillon").click();
    await page.getByText("Sélectionnez un patient.", { exact: true }).waitFor();
    assert(
      await page
        .getByLabel("Patient (obligatoire)", { exact: true })
        .evaluate((node) => node === document.activeElement),
    );
    await page
      .getByLabel("Patient (obligatoire)", { exact: true })
      .selectOption("patient-demo-003");
    await button(page, "Ajouter une ligne personnalisée").click();
    await page
      .getByLabel("Désignation de l’acte (obligatoire)")
      .fill("Exemple fictif mobile");
    await page.keyboard.press("Tab");
    assert(
      await page
        .getByLabel("Prix de l’acte en DH (obligatoire)")
        .evaluate((node) => node === document.activeElement),
    );
    await page.getByLabel("Prix de l’acte en DH (obligatoire)").fill("1,001");
    await button(page, "Enregistrer le brouillon").click();
    await page
      .getByRole("alert")
      .filter({ hasText: /décimales/ })
      .waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await screenshot(page, "editor-mobile");
    await page.goto(`${harness.baseURL}/facturation/invoice-demo-002`);
    await heading(page, "Facture 2026-001");
    await button(page, "Annuler la facture").click();
    assert(
      await page
        .getByLabel("Motif d’annulation (obligatoire)")
        .evaluate((node) => node === document.activeElement),
    );
    await page
      .getByLabel("Motif d’annulation (obligatoire)")
      .fill("Erreur de saisie fictive");
    await button(page, "Annuler la facture").click();
    await page.keyboard.press("Escape");
    await button(page, "Annuler la facture").click();
    await button(page, "Confirmer l’annulation").click();
    await page.getByText("Annulée", { exact: true }).waitFor();
    assert.equal(await button(page, "Vérifier le règlement").count(), 0);
    await heading(page, "Facture 2026-001");
    for (const [route, title] of [
      ["/facturation/missing", "Cette facture est introuvable."],
      [
        "/facturation/invoice-demo-002/modifier",
        "Cette facture est en lecture seule.",
      ],
      [
        "/facturation/nouvelle?patientId=missing",
        "Ce patient est introuvable.",
      ],
      [
        "/facturation/nouvelle?patientId=patient-demo-001&consultationId=consultation-demo-002",
        "Le lien de consultation est invalide pour ce patient.",
      ],
    ]) {
      await page.goto(`${harness.baseURL}${route}`);
      await heading(page, title);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await value.close();
  }
});
