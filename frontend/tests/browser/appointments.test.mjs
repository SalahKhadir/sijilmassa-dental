import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import path from "node:path";
import { tmpdir } from "node:os";
import { browserHarness } from "./browser-harness.mjs";
import { clinicDate } from "../../src/lib/patients/dates.ts";
import {
  addLocalDays,
  mondayOfWeek,
  localWeekday,
  formatMinutes,
  parseLocalTime,
} from "../../src/lib/appointments/local-time.ts";
import { developmentSchedule } from "../../src/lib/appointments/schedule.ts";
const harness = browserHarness({ port: 3101 });
const baseURL = harness.baseURL;
before(harness.start);
after(harness.stop);
const futureDate = addLocalDays(mondayOfWeek(clinicDate()), 7);
async function heading(page, name) {
  await page.getByRole("heading", { name, exact: true }).waitFor();
}
async function save(page) {
  await page
    .getByRole("button", { name: "Créer le rendez-vous fictif", exact: true })
    .click();
}
async function status(page, value) {
  await page.getByLabel("Nouveau statut", { exact: true }).selectOption(value);
  await page
    .getByRole("button", { name: "Appliquer le statut", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Rendez-vous fictif mis à jour en mémoire" })
    .waitFor();
}
async function dashboardCounter(page, label) {
  const card = page.getByRole("region", { name: "Indicateurs du cabinet" });
  return Number(
    await card
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator("p")
      .nth(1)
      .innerText(),
  );
}

test("shared appointments create, edit, conflict, cancel, reactivate and update patient and dashboard views", async () => {
  const { value, page, errors, external } = await harness.context();
  try {
    await page.goto(`${baseURL}/`);
    await heading(page, "Tableau de bord");
    await page
      .getByRole("heading", { name: "Prochains rendez-vous", exact: true })
      .waitFor();
    const pendingBefore = await dashboardCounter(page, "À confirmer");
    await page
      .getByRole("link", { name: "Annuaire synthétique", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "20 patients trouvés" })
      .waitFor();
    await page
      .getByRole("searchbox", { name: "Rechercher un patient" })
      .fill("demo-pat-0003");
    await page
      .getByRole("link", { name: "Mériem Démo-Idrissi", exact: true })
      .click();
    await heading(page, "Mériem Démo-Idrissi");
    await page
      .getByRole("link", { name: "Prendre rendez-vous", exact: true })
      .click();
    await heading(page, "Nouveau rendez-vous");
    assert.equal(
      await page
        .getByLabel("Patient (obligatoire)", { exact: true })
        .inputValue(),
      "patient-demo-003",
    );
    const patientSearch = page.getByRole("searchbox", {
      name: "Rechercher un patient",
    });
    await patientSearch.fill("aucun-patient-xyz");
    await page
      .getByRole("status")
      .filter({ hasText: "Aucun patient ne correspond" })
      .waitFor();
    assert.equal(
      await page
        .getByLabel("Patient (obligatoire)", { exact: true })
        .inputValue(),
      "patient-demo-003",
    );
    await patientSearch.fill(" MERIEM    demo-idrissi ");
    await page
      .getByRole("status")
      .filter({ hasText: "1 patient(s) trouvé(s)" })
      .waitFor();
    await page
      .getByLabel("Date (obligatoire)", { exact: true })
      .fill(futureDate);
    await page
      .getByLabel("Heure de début (obligatoire)", { exact: true })
      .fill("12:15");
    await save(page);
    await page
      .getByText(
        "Choisissez un créneau dans les horaires de développement affichés, sans traverser la pause.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByLabel("Heure de début (obligatoire)", { exact: true })
      .fill("09:00");
    await page
      .getByLabel("Durée en minutes (obligatoire)", { exact: true })
      .fill("0");
    await save(page);
    await page
      .getByText("La durée minimale du prototype est de 30 minutes.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByLabel("Durée en minutes (obligatoire)", { exact: true })
      .fill("30");
    await page
      .getByLabel("Motif administratif (facultatif)", { exact: true })
      .fill("Motif d’organisation fictif");
    await save(page);
    await page.waitForURL(/\/rendez-vous\/appointment-demo-013$/);
    await heading(page, "Détails du rendez-vous");
    await page
      .getByRole("status")
      .filter({ hasText: "Rendez-vous fictif créé en mémoire" })
      .waitFor();
    assert(
      (await page.locator("main").innerText()).includes("Mériem Démo-Idrissi"),
    );
    assert(
      !(await page.locator("main").innerText()).includes(
        "Antécédents médicaux",
      ),
    );
    await status(page, "CONFIRME");
    await page
      .getByRole("link", { name: "Voir la fiche patient", exact: true })
      .click();
    await heading(page, "Mériem Démo-Idrissi");
    const patientAgenda = page.getByRole("region", {
      name: "Rendez-vous à venir ou en cours",
    });
    await patientAgenda
      .getByRole("link")
      .filter({ hasText: "09:00–09:30" })
      .waitFor();
    await page
      .getByRole("link", { name: "Prendre rendez-vous", exact: true })
      .click();
    await page
      .getByLabel("Date (obligatoire)", { exact: true })
      .fill(futureDate);
    await page
      .getByLabel("Heure de début (obligatoire)", { exact: true })
      .fill("09:15");
    await save(page);
    await page
      .getByText(
        "Ce créneau chevauche un rendez-vous de 09:00 à 09:30. Choisissez un autre horaire.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByLabel("Heure de début (obligatoire)", { exact: true })
      .fill("09:30");
    await save(page);
    await page.waitForURL(/\/rendez-vous\/appointment-demo-014$/);
    await page
      .getByRole("link", { name: "Modifier le rendez-vous", exact: true })
      .click();
    await heading(page, "Modifier le rendez-vous");
    assert.equal(
      await page
        .getByLabel("Heure de début (obligatoire)", { exact: true })
        .inputValue(),
      "09:30",
    );
    await page
      .getByLabel("Heure de début (obligatoire)", { exact: true })
      .fill("09:45");
    await page
      .getByRole("button", { name: "Enregistrer en mémoire", exact: true })
      .click();
    await page.waitForURL(/\/rendez-vous\/appointment-demo-014$/);
    await page
      .getByRole("status")
      .filter({ hasText: "Rendez-vous fictif modifié en mémoire" })
      .waitFor();
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Tableau de bord", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Prochains rendez-vous", exact: true })
      .waitFor();
    assert.equal(
      await dashboardCounter(page, "À confirmer"),
      pendingBefore + 1,
    );
    await page
      .getByRole("link", { name: "Voir l’agenda", exact: true })
      .click();
    await heading(page, "Rendez-vous");
    await page.getByLabel("Date affichée", { exact: true }).fill(futureDate);
    await page
      .getByRole("region", { name: /Grille horaire/ })
      .getByRole("link")
      .filter({ hasText: "09:45–10:15" })
      .click();
    await heading(page, "Détails du rendez-vous");
    await status(page, "ANNULE");
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Tableau de bord", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Prochains rendez-vous", exact: true })
      .waitFor();
    assert.equal(await dashboardCounter(page, "À confirmer"), pendingBefore);
    await page
      .getByRole("link", { name: "Ouvrir l’agenda", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Nouveau rendez-vous", exact: true })
      .click();
    await page
      .getByLabel("Patient (obligatoire)", { exact: true })
      .selectOption("patient-demo-001");
    await page
      .getByLabel("Date (obligatoire)", { exact: true })
      .fill(futureDate);
    await page
      .getByLabel("Heure de début (obligatoire)", { exact: true })
      .fill("09:45");
    await save(page);
    await page.waitForURL(/\/rendez-vous\/appointment-demo-015$/);
    await page
      .getByRole("link", { name: "Fermer les détails", exact: true })
      .click();
    await heading(page, "Rendez-vous");
    const grid = page.getByRole("region", { name: /Grille horaire/ });
    await grid.locator('a[href="/rendez-vous/appointment-demo-014"]').click();
    await heading(page, "Détails du rendez-vous");
    await page
      .getByLabel("Nouveau statut", { exact: true })
      .selectOption("CONFIRME");
    await page
      .getByRole("button", { name: "Appliquer le statut", exact: true })
      .click();
    await page
      .getByText(
        "Ce créneau chevauche un rendez-vous de 09:45 à 10:15. Choisissez un autre horaire.",
        { exact: true },
      )
      .waitFor();
    assert((await page.locator("main").innerText()).includes("Annulé"));
    const today = clinicDate();
    const periods = developmentSchedule.weeklyHours[localWeekday(today)] ?? [];
    if (periods.length) {
      await page
        .getByRole("navigation", { name: "Navigation principale" })
        .getByRole("link", { name: "Tableau de bord", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Prochains rendez-vous", exact: true })
        .waitFor();
      const countBefore = await dashboardCounter(page, "Rendez-vous du jour");
      await page
        .getByRole("link", { name: "Ouvrir l’agenda", exact: true })
        .click();
      await page
        .getByRole("link", { name: "Nouveau rendez-vous", exact: true })
        .click();
      await page
        .getByLabel("Patient (obligatoire)", { exact: true })
        .selectOption("patient-demo-001");
      await page.getByLabel("Date (obligatoire)", { exact: true }).fill(today);
      await page
        .getByLabel("Heure de début (obligatoire)", { exact: true })
        .fill(formatMinutes(parseLocalTime(periods.at(-1).end) - 30));
      await save(page);
      await heading(page, "Détails du rendez-vous");
      await page
        .getByRole("navigation", { name: "Navigation principale" })
        .getByRole("link", { name: "Tableau de bord", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Prochains rendez-vous", exact: true })
        .waitFor();
      assert.equal(
        await dashboardCounter(page, "Rendez-vous du jour"),
        countBefore + 1,
      );
    }
    assert.equal(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
      0,
    );
    assert((await value.cookies()).every(cookie => cookie.name === "JSESSIONID" && cookie.httpOnly));
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } catch (error) {
    await page.screenshot({
      path: path.join(tmpdir(), `appointments-flow-${process.pid}.png`),
      fullPage: true,
    });
    throw error;
  } finally {
    await value.close();
  }
});

test("calendar navigation, responsive agenda, keyboard, historical entries and unknown ids", async () => {
  const { value, page, errors, external } = await harness.context({
    reducedMotion: "reduce",
  });
  try {
    for (const width of [1440, 1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${baseURL}/rendez-vous?date=2026-11-07`);
      await heading(page, "Rendez-vous");
      await page.getByRole("button", { name: "Semaine", exact: true }).click();
      await page
        .getByRole("heading", { name: /Du lundi 2 novembre 2026/ })
        .waitFor();
      if (width < 1280) {
        await page
          .getByRole("group", { name: "Jours de la semaine" })
          .getByRole("button", { name: /sam\./ })
          .click();
        const list = page.getByRole("list", {
          name: "Liste des rendez-vous",
          exact: true,
        });
        await list.waitFor();
        assert((await list.innerText()).includes("Annulé"));
        assert((await list.innerText()).includes("Absent"));
      } else {
        const region = page.getByRole("region", { name: /Grille horaire/ });
        await region.waitFor();
        const axisLeft = (
          await region.locator("[data-time-axis]").boundingBox()
        ).x;
        const regionLeft = (await region.boundingBox()).x;
        assert(
          Math.abs(axisLeft - regionLeft) < 2,
          "Time labels stay visible during horizontal scrolling",
        );
        assert.equal(
          await region
            .locator('a[href="/rendez-vous/appointment-demo-011"]')
            .count(),
          1,
        );
      }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Calendar overflows at ${width}`,
      );
      if (process.env.APPOINTMENTS_TEST_SCREENSHOT_DIR) {
        await page.evaluate(() => {
          document.activeElement?.blur();
          window.scrollTo(0, 0);
        });
        await page.screenshot({
          path: path.join(
            process.env.APPOINTMENTS_TEST_SCREENSHOT_DIR,
            `calendar-${width}.png`,
          ),
          fullPage: true,
        });
      }
    }
    await page.getByLabel("Date affichée", { exact: true }).fill("2027-01-01");
    await page.getByRole("heading", { name: /2026.*2027/ }).waitFor();
    await page
      .getByRole("button", { name: "Semaine suivante", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Date affichée", { exact: true }).inputValue(),
      "2027-01-08",
    );
    await page
      .getByRole("button", { name: "Semaine précédente", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Aujourd’hui", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Date affichée", { exact: true }).inputValue(),
      clinicDate(),
    );
    await page.goto(`${baseURL}/rendez-vous/nouveau?patientId=unknown`);
    await heading(page, "Nouveau rendez-vous");
    await page
      .getByText(
        "Le patient présélectionné est introuvable. Choisissez un patient de la liste.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByLabel("Patient (obligatoire)", { exact: true })
      .selectOption("patient-demo-001");
    const date = page.getByLabel("Date (obligatoire)", { exact: true });
    await date.fill(futureDate);
    await page
      .getByRole("searchbox", { name: "Rechercher un patient" })
      .focus();
    await page.keyboard.press("Tab");
    assert(
      await page
        .getByLabel("Patient (obligatoire)", { exact: true })
        .evaluate((element) => element === document.activeElement),
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (process.env.APPOINTMENTS_TEST_SCREENSHOT_DIR)
      await page.screenshot({
        path: path.join(
          process.env.APPOINTMENTS_TEST_SCREENSHOT_DIR,
          "appointment-form-mobile.png",
        ),
        fullPage: true,
      });
    await page.goto(`${baseURL}/rendez-vous/id-inconnu`);
    await heading(page, "Rendez-vous introuvable");
    await page.goto(`${baseURL}/rendez-vous/id-inconnu/modifier`);
    await heading(page, "Rendez-vous introuvable");
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } catch (error) {
    await page.screenshot({
      path: path.join(tmpdir(), `appointments-responsive-${process.pid}.png`),
      fullPage: true,
    });
    throw error;
  } finally {
    await value.close();
  }
});
