import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { browserHarness } from "./browser-harness.mjs";
import path from "node:path";
import { tmpdir } from "node:os";

const harness = browserHarness({ port: 3100 });
const baseURL = harness.baseURL;
before(harness.start);
after(harness.stop);
const context = harness.context;
async function heading(page, name) {
  await page.getByRole("heading", { name, exact: true }).waitFor();
}
async function continueStep(page) {
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
}

// These tests use only synthetic inputs and never print patient form values.
test("directory, validation, medical checkboxes, creation, editing, navigation and refresh", async () => {
  const { value, page, errors, external } = await context();
  try {
    await page.goto(`${baseURL}/patients`);
    await heading(page, "Patients");
    await page
      .getByRole("status")
      .filter({ hasText: "20 patients trouvés" })
      .waitFor();
    assert.equal(await page.getByRole("table").count(), 1);
    assert(
      !(await page.locator("main").innerText()).includes(
        "Antécédents médicaux",
      ),
    );
    const search = page.getByRole("searchbox", {
      name: "Rechercher un patient",
    });
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await page.getByText(/Page 2 sur 2/).waitFor();
    await search.fill("  MERIEM   DEMO-IDRISSI  ");
    await page
      .getByRole("status")
      .filter({ hasText: "1 patient trouvé" })
      .waitFor();
    await page.getByText(/Page 1 sur 1/).waitFor();
    await page
      .getByRole("link", { name: "Mériem Démo-Idrissi", exact: true })
      .click();
    await heading(page, "Mériem Démo-Idrissi");
    assert(!(await page.locator("main").innerText()).includes("DEMO-CIN-0003"));
    assert((await page.locator("main").innerText()).includes("masquée"));
    assert(
      !(await page.locator("main").innerText()).includes(
        "Précision entièrement fictive",
      ),
    );
    await page
      .getByRole("link", { name: "Retour à l’annuaire", exact: true })
      .click();
    await heading(page, "Patients");
    await page
      .getByLabel("Statut administratif", { exact: true })
      .selectOption("inactive");
    await page
      .getByRole("status")
      .filter({ hasText: "4 patients trouvés" })
      .waitFor();
    await search.fill("aucun-resultat-xyz");
    await heading(page, "Aucun résultat");
    await page
      .getByRole("button", { name: "Réinitialiser les filtres" })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "20 patients trouvés" })
      .waitFor();
    await page.getByLabel("Trier les patients").selectOption("newest");
    await page
      .getByRole("link", { name: "Nouveau patient", exact: true })
      .click();
    await heading(page, "Nouveau patient");
    await continueStep(page);
    await page.getByText("Saisissez le nom.", { exact: true }).waitFor();
    assert(
      await page
        .getByLabel("Nom (obligatoire)", { exact: true })
        .evaluate((element) => element === document.activeElement),
    );
    await page
      .getByLabel("Nom (obligatoire)", { exact: true })
      .fill(" Démo-Navigation ");
    await page
      .getByLabel("Prénom (obligatoire)", { exact: true })
      .fill(" Prénom   fictif ");
    await page
      .getByLabel("Date de naissance", { exact: true })
      .fill("2099-01-01");
    await continueStep(page);
    await page
      .getByText("La date de naissance ne peut pas être dans le futur.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByLabel("Date de naissance", { exact: true })
      .fill("1995-05-20");
    await page.getByLabel("Sexe", { exact: true }).selectOption("M");
    await page.getByLabel("GSM", { exact: true }).fill("+212 6XX XX 10 10");
    await page.getByLabel("CIN N°", { exact: true }).fill("DEMO-CIN-TEST-ONLY");
    await continueStep(page);
    await heading(page, "Antécédents médicaux");
    await page
      .getByRole("checkbox", { name: "Cardiaque", exact: true })
      .check();
    await page.getByRole("checkbox", { name: "Autres", exact: true }).check();
    await page.getByLabel("Précisions pour Autres").fill("Précision fictive");
    await page.getByRole("checkbox", { name: "Autres", exact: true }).uncheck();
    assert.equal(
      await page.getByLabel("Précisions pour Autres").inputValue(),
      "",
    );
    await page
      .getByLabel("État du recueil", { exact: true })
      .selectOption("unanswered");
    assert(
      !(await page
        .getByRole("checkbox", { name: "Cardiaque", exact: true })
        .isChecked()),
    );
    await page.getByRole("checkbox", { name: "Diabète", exact: true }).check();
    await continueStep(page);
    await heading(page, "Allergies et questionnaire de santé");
    const pregnancy = page.getByRole("group", {
      name: "Êtes-vous enceinte ?",
      exact: true,
    });
    assert(
      await pregnancy
        .getByRole("radio", { name: "Non renseigné", exact: true })
        .isChecked(),
    );
    await page
      .getByRole("group", {
        name: "Êtes-vous sous traitement médical ?",
        exact: true,
      })
      .getByRole("radio", { name: "Non", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Anesthésie", exact: true })
      .check();
    await continueStep(page);
    await heading(page, "Vérification et confirmation");
    assert.equal(page.url(), `${baseURL}/patients/nouveau`);
    assert(
      !(await page.locator("main").innerText()).includes("DEMO-CIN-TEST-ONLY"),
    );
    await page
      .getByRole("button", { name: "Créer le dossier fictif", exact: true })
      .click();
    await page.waitForURL(/\/patients\/patient-demo-021\/dossier$/);
    await heading(page, "Prénom fictif Démo-Navigation");
    await page
      .getByRole("status")
      .filter({ hasText: "Dossier fictif créé en mémoire" })
      .waitFor();
    assert((await page.locator("main").innerText()).includes("Non renseigné"));
    await page
      .getByRole("link", { name: "Modifier le dossier de santé", exact: true })
      .click();
    await heading(page, "Modifier le dossier de santé");
    await continueStep(page);
    assert(
      await page
        .getByRole("checkbox", { name: "Diabète", exact: true })
        .isChecked(),
    );
    await continueStep(page);
    assert(
      await pregnancy
        .getByRole("radio", { name: "Non renseigné", exact: true })
        .isChecked(),
    );
    await pregnancy.getByRole("radio", { name: "Non", exact: true }).check();
    await continueStep(page);
    await page
      .getByRole("button", { name: "Enregistrer en mémoire", exact: true })
      .click();
    await page.waitForURL(/\/patients\/patient-demo-021\/dossier$/);
    await page
      .getByRole("status")
      .filter({ hasText: "Dossier fictif modifié en mémoire" })
      .waitFor();
    await page
      .getByRole("link", { name: "Informations personnelles", exact: true })
      .click();
    await heading(page, "Prénom fictif Démo-Navigation");
    await page
      .getByRole("link", { name: "Modifier le patient", exact: true })
      .click();
    await heading(page, "Modifier le patient");
    assert(
      !(await page.locator("main").innerText()).includes(
        "Antécédents médicaux",
      ),
    );
    await page
      .getByLabel("Prénom (obligatoire)", { exact: true })
      .fill("Prénom modifié fictif");
    await continueStep(page);
    assert(
      !(await page.locator("main").innerText()).includes("Êtes-vous enceinte"),
    );
    await page
      .getByRole("button", { name: "Enregistrer en mémoire", exact: true })
      .click();
    await page.waitForURL(/\/patients\/patient-demo-021$/);
    await heading(page, "Prénom modifié fictif Démo-Navigation");
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Tableau de bord", exact: true })
      .click();
    await heading(page, "Tableau de bord");
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Patients", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "21 patients trouvés" })
      .waitFor();
    await search.fill("demo-navigation");
    await page
      .getByRole("link", {
        name: "Prénom modifié fictif Démo-Navigation",
        exact: true,
      })
      .click();
    await heading(page, "Prénom modifié fictif Démo-Navigation");
    await page
      .getByRole("link", {
        name: "Questionnaire et traitements · Prototype dentiste",
        exact: true,
      })
      .click();
    await heading(page, "Prénom modifié fictif Démo-Navigation");
    const health = page.getByText("Êtes-vous enceinte ?", { exact: true });
    assert.equal(await health.locator("..").locator("dd").innerText(), "Non");
    assert.equal(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
      0,
    );
    assert((await value.cookies()).every(cookie => cookie.name === "JSESSIONID" && cookie.httpOnly));
    await page.reload();
    await heading(page, "Patient introuvable");
    await page.goto(`${baseURL}/patients/id-inconnu/modifier`);
    await heading(page, "Patient introuvable");
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } catch (error) {
    await page.screenshot({
      path: path.join(
        tmpdir(),
        `sijilmassa-patients-flow-failure-${process.pid}.png`,
      ),
      fullPage: true,
    });
    throw error;
  } finally {
    await value.close();
  }
});

test("responsive layouts, keyboard, reduced motion, treatment examples and existing routes", async () => {
  const { value, page, errors, external } = await context({
    reducedMotion: "reduce",
  });
  try {
    for (const width of [1440, 1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${baseURL}/patients`);
      await page
        .getByRole("status")
        .filter({ hasText: "20 patients trouvés" })
        .waitFor();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Directory overflows at ${width}px`,
      );
      if (process.env.PATIENTS_TEST_SCREENSHOT_DIR)
        await page.screenshot({
          path: path.join(
            process.env.PATIENTS_TEST_SCREENSHOT_DIR,
            `directory-${width}.png`,
          ),
          fullPage: true,
        });
      await page.goto(`${baseURL}/patients/patient-demo-001/dossier`);
      await heading(page, "Aïcha Démo-Amrani");
      await page.getByRole("table").waitFor();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Dossier overflows at ${width}px`,
      );
      if (process.env.PATIENTS_TEST_SCREENSHOT_DIR)
        await page.screenshot({
          path: path.join(
            process.env.PATIENTS_TEST_SCREENSHOT_DIR,
            `dossier-${width}.png`,
          ),
          fullPage: true,
        });
      await page.goto(`${baseURL}/patients/nouveau`);
      await heading(page, "Nouveau patient");
      const lastName = page.getByLabel("Nom (obligatoire)", { exact: true });
      await lastName.focus();
      await page.keyboard.type("Démo-Clavier");
      await page.keyboard.press("Tab");
      const firstName = page.getByLabel("Prénom (obligatoire)", {
        exact: true,
      });
      assert(
        await firstName.evaluate(
          (element) => element === document.activeElement,
        ),
      );
      await page.keyboard.type("Patient fictif");
      await page.keyboard.press("Enter");
      await heading(page, "Antécédents médicaux");
      const condition = page.getByRole("checkbox", {
        name: "Cardiaque",
        exact: true,
      });
      await condition.focus();
      await page.keyboard.press("Space");
      assert(await condition.isChecked());
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Form overflows at ${width}px`,
      );
      const transition = await condition.evaluate(
        (element) => getComputedStyle(element).transitionDuration,
      );
      assert(
        transition
          .split(",")
          .every((duration) => parseFloat(duration) <= 0.00001),
      );
    }
    for (const [path, title] of [
      ["/", "Tableau de bord"],
      ["/login", "Tableau de bord"],
      ["/rendez-vous", "Rendez-vous"],
      ["/consultations", "Consultations"],
      ["/facturation", "Facturation"],
      ["/documents", "Documents"],
      ["/parametres", "Paramètres"],
    ]) {
      await page.goto(`${baseURL}${path}`);
      await heading(page, title);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } catch (error) {
    await page.screenshot({
      path: path.join(
        tmpdir(),
        `sijilmassa-patients-responsive-failure-${process.pid}.png`,
      ),
      fullPage: true,
    });
    throw error;
  } finally {
    await value.close();
  }
});

test("login preserves validation, password visibility and generic real authentication errors", async () => {
  const { value, page, errors, external } = await context({
    anonymous: true,
    viewport: { width: 390, height: 900 },
  });
  try {
    await page.goto(`${baseURL}/login`);
    await heading(page, "Connexion");
    await page
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();
    await page
      .getByText("Saisissez votre identifiant.", { exact: true })
      .waitFor();
    await page
      .getByText("Saisissez votre mot de passe.", { exact: true })
      .waitFor();
    await page
      .getByLabel("Identifiant (obligatoire)", { exact: true })
      .fill("compte-fictif");
    const password = page.getByLabel("Mot de passe (obligatoire)", {
      exact: true,
    });
    await password.fill("mot-de-passe-fictif");
    await page
      .getByRole("button", { name: "Afficher le mot de passe", exact: true })
      .click();
    assert.equal(await password.getAttribute("type"), "text");
    await page
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Connexion refusée" })
      .waitFor();
    assert.equal(page.url(), `${baseURL}/login`);
    assert.equal(await password.inputValue(), "");
    assert.equal(await password.getAttribute("type"), "password");
    assert.equal(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
      0,
    );
    assert((await value.cookies()).every(cookie => cookie.name === "JSESSIONID" && cookie.httpOnly));
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await value.close();
  }
});
