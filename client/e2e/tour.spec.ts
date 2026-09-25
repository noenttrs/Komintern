import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Visite guidée de l'interface pour une relecture humaine : une partie rapide complète à 14
// joueurs, avec une capture de chaque écran critique. Lente (14 navigateurs) : lancée à la
// demande avec TOUR=1, jamais dans la suite normale.
//   TOUR=1 npx playwright test e2e/tour.spec.ts

const OUT = "e2e/screenshots/tour";
const SIZE = { width: 375, height: 667 };

test.skip(!process.env.TOUR, "visite guidée : TOUR=1 pour la lancer");

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function tapCard(page: Page): Promise<void> {
  const box = await page.locator(".card-zone").boundingBox();
  if (box === null) throw new Error("no card on screen");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.35);
}

/** Maintient la carte (rôle affiché), fait la capture, puis relâche. */
async function holdCard(page: Page, name?: string): Promise<void> {
  const box = (await page.locator(".card-zone").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.35);
  await page.mouse.down();
  await expect(page.locator(".card-overlay")).toBeVisible();
  if (name !== undefined) await shot(page, name);
  await page.mouse.up();
  await page.waitForTimeout(800);
}

/** Fait glisser la carte vers la gauche : dos de carte (historique). */
async function flipCard(page: Page): Promise<void> {
  const box = (await page.locator(".card-zone").boundingBox())!;
  const y = box.y + box.height * 0.35;
  await page.mouse.move(box.x + box.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

test("visite guidée : partie rapide à 14 joueurs", async ({ browser }) => {
  test.setTimeout(1_200_000);
  const pages: Page[] = [];
  for (let index = 0; index < 14; index += 1) {
    const context = await browser.newContext({ viewport: SIZE, isMobile: true, hasTouch: true, locale: "fr-FR" });
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate((pseudo) => {
      window.localStorage.setItem("komintern.pseudo", pseudo);
      window.localStorage.setItem("komintern.tips_seen", JSON.stringify(["*"]));
    }, ["Rosa", "Karl", "Clara", "Louise", "Jean", "Olympe", "Victor", "Simone", "Émile", "Frida", "Nestor", "Lucie", "Hô", "Angela"][index] as string);
    await page.reload();
    pages.push(page);
  }
  const [host, guest] = pages as [Page, Page];

  // Création et salon
  await host.getByRole("button", { name: "Créer une room" }).click();
  await shot(host, "01-creation-room");
  await host.getByRole("button", { name: "Créer", exact: true }).click();
  const code = (await host.locator(".room-code").innerText()).replace(/^room\s+/i, "").trim();
  for (const page of pages.slice(1)) {
    await page.goto(`/r/${code}`);
    await expect(page.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
  }
  await expect(host.getByText("14 joueurs · de 2 à 14")).toBeVisible();
  // Partie rapide : proposée à l'hôte dans le salon, à partir de 6 joueurs.
  await host.getByRole("radio", { name: "Rapide" }).click();
  await shot(host, "02-salon-14-hote");
  await shot(guest, "03-salon-14-invite");
  await host.getByRole("button", { name: "QR code" }).click();
  await shot(host, "04-qr-code");
  await host.getByRole("button", { name: "Fermer" }).click();

  // Ordre de table
  await host.getByRole("button", { name: "Démarrer" }).click();
  await expect(host.getByText("Touchez pour prendre votre numéro d'ordre")).toBeVisible();
  await shot(host, "05-ordre-table-debut");
  for (const [index, page] of pages.entries()) {
    await expect(page.getByText("Touchez pour prendre votre numéro d'ordre")).toBeVisible();
    await tapCard(page);
    if (index === 6) await shot(host, "06-ordre-table-en-cours");
  }
  await expect(host.getByText(/Suite dans \d+ s/)).toBeVisible();
  await shot(host, "07-ordre-table-complet");
  for (const page of pages) {
    if (await page.getByText(/Suite dans \d+ s/).isVisible().catch(() => false)) await tapCard(page);
  }

  // Rôles : une capture nazi (liste des 14 rôles) et une communiste
  let nazi: Page | null = null;
  let communist: Page | null = null;
  for (const page of pages) {
    await expect(page.getByText("Maintenez pour voir votre rôle")).toBeVisible();
    const box = (await page.locator(".card-zone").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.35);
    await page.mouse.down();
    await expect(page.locator(".card-overlay")).toBeVisible();
    const text = await page.locator(".card-overlay").innerText();
    const isNazi = /nazi/i.test(text.split("\n")[0] ?? "");
    if (isNazi && nazi === null) {
      nazi = page;
      await shot(page, "08-role-nazi-14");
    } else if (!isNazi && communist === null) {
      communist = page;
      await shot(page, "09-role-communiste");
    }
    await page.mouse.up();
    await page.waitForTimeout(800);
  }
  await shot(host, "10-attente-confirmation-roles");

  // Manches : les nazis sabotent aux manches 2 et 4, pour un historique varié
  for (let round = 1; round <= 5; round += 1) {
    let chef: Page | undefined;
    await expect
      .poll(async () => {
        for (const page of pages) {
          if (await page.getByText(/Choisir l'équipe/).isVisible()) {
            chef = page;
            return true;
          }
        }
        return false;
      }, { timeout: 30_000 })
      .toBe(true);
    const teamSize = Number((await chef!.getByText(/Choisir l'équipe/).innerText()).match(/\d+/)?.[0]);
    if (round === 1) {
      await shot(chef!, "11-proposition-chef-vide");
      const other = pages.find((page) => page !== chef)!;
      await shot(other, "12-attente-proposition");
    }
    const chips = chef!.locator(".team-grid .chip");
    // Équipe différente à chaque manche
    for (let index = 0; index < teamSize; index += 1) await chips.nth((index + round * 3) % 14).click();
    if (round === 1) await shot(chef!, "13-proposition-chef-equipe");
    await chef!.getByRole("button", { name: "Proposer l'équipe" }).first().click();

    for (const [index, page] of pages.entries()) {
      await expect(page.getByRole("heading", { name: "Vote de confiance" }).first()).toBeVisible();
      if (round === 1 && index === 0) await shot(page, "14-vote-confiance");
      // Manche 3 : un vote serré (6 contre)
      const vote = round === 3 && index < 6 ? "✕" : "✓";
      await page.getByRole("button", { name: vote }).first().click();
      if (round === 1 && index === 0) await shot(page, "15-vote-envoye-attente");
    }
    for (const page of pages) await expect(page.getByText(/Majorité POUR/).first()).toBeVisible();
    if (round === 1) await shot(host, "16-resultat-confiance-14-votes");
    if (round === 3) await shot(host, "17-resultat-confiance-serre");
    for (const page of pages) await tapCard(page);

    for (const [index, page] of pages.entries()) {
      await expect(
        page.locator(".vote-stack--split").or(page.getByText("En attente.", { exact: true })).or(page.getByText(/Victoire (nazie|communiste)/)).first(),
      ).toBeVisible();
      const communistButton = page.locator('.vote-stack button:has(svg[viewBox="0 0 24 24"])').first();
      if (await communistButton.isVisible().catch(() => false)) {
        if (round === 1 && !(await page.locator(".vote-stack button[disabled]").count())) await shot(page, "18-vote-mission-nazi");
        if (round === 1 && (await page.locator(".vote-stack button[disabled]").count())) await shot(page, "19-vote-mission-communiste");
        const sabotage = page.locator('.vote-stack button:not(:has(svg[viewBox="0 0 24 24"])):not([disabled])').first();
        if ((round === 2 || round === 4) && (await sabotage.isVisible().catch(() => false))) await sabotage.click();
        else await communistButton.click();
      } else if (round === 1 && index === 0) {
        await shot(page, "20-attente-mission-hors-equipe");
      }
    }
    for (const page of pages) await expect(page.getByText(/Victoire (nazie|communiste)/).first()).toBeVisible();
    if (round === 1) await shot(host, "21-resultat-mission-reussie");
    if (round === 2) await shot(host, "22-resultat-mission-sabotee");
    const over = await host.getByRole("button", { name: "Rejouer" }).first().isVisible().catch(() => false);
    if (round === 3) {
      await flipCard(host);
      await shot(host, "23-historique-dos-de-carte");
      await flipCard(host);
    }
    for (const page of pages) {
      if (await page.getByText(/Suite dans \d+ s/).isVisible().catch(() => false)) await tapCard(page);
    }
    await host.waitForTimeout(500);
    if (over || (await host.getByRole("button", { name: "Rejouer" }).first().isVisible().catch(() => false))) break;
  }

  // Fin de partie à 14
  await expect(host.getByRole("button", { name: "Rejouer" }).first()).toBeVisible({ timeout: 30_000 });
  await shot(host, "24-fin-partie-14");
  await holdCard(host, "25-fin-partie-14-roles-reveles");
  await flipCard(host);
  await shot(host, "26-fin-partie-14-historique");
  await flipCard(host);
  await host.getByRole("button", { name: "Rejouer" }).first().click();
  await shot(host, "27-rejouer-attente");
});
