import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import { useTestRoomName } from "./testRoom";

// Ordinateur : panneau des joueurs et de l'historique à côté de la carte, une manche au clavier.

async function desktop(browser: Browser, pseudo: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" })).newPage();
  await page.goto("/");
  await page.evaluate((name) => {
    window.localStorage.setItem("komintern.pseudo", name);
    window.localStorage.setItem("komintern.tips_seen", JSON.stringify(["*"]));
  }, pseudo);
  await page.reload();
  return page;
}

test("une manche au clavier sur ordinateur, avec le panneau des joueurs", async ({ browser }) => {
  test.setTimeout(120_000);
  const pages = [await desktop(browser, "Clavier1")];
  const [host] = pages as [Page];
  await host.getByRole("button", { name: "Créer une room" }).click();
  await useTestRoomName(host);
  await host.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(host.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
  const code = (await host.locator(".room-code").innerText()).replace(/^room\s+/i, "").trim();
  for (const name of ["Clavier2", "Clavier3"]) {
    const page = await desktop(browser, name);
    await page.goto(`/r/${code}`);
    await expect(page.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
    pages.push(page);
  }
  await host.getByRole("button", { name: "Démarrer" }).click();

  // Tour de table : Entrée pour prendre sa place, puis l'ordre se valide.
  for (const page of pages) {
    await expect(page.getByRole("heading", { name: "Tour de table" })).toBeVisible();
    await page.locator("body").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Votre numéro d'ordre/)).toBeVisible();
  }
  await expect(host.getByRole("complementary", { name: "Partie" })).toBeVisible();

  // Rôle : maintenir R.
  for (const page of pages) {
    await expect(page.getByText("Maintenez pour voir votre rôle")).toBeVisible({ timeout: 15_000 });
    await page.keyboard.down("r");
    await expect(page.locator(".card-overlay")).toBeVisible();
    await page.keyboard.up("r");
    await expect(page.locator(".card-overlay")).toHaveCount(0);
  }

  // Proposition : le chef choisit à la souris, puis Entrée pour proposer.
  let chef: Page | undefined;
  await expect.poll(async () => {
    for (const page of pages) if (await page.getByText(/Choisir l'équipe/).isVisible()) chef = page;
    return chef !== undefined;
  }, { timeout: 15_000 }).toBe(true);
  const size = Number((await chef!.getByText(/Choisir l'équipe/).innerText()).match(/\d+/)?.[0]);
  for (let index = 0; index < size; index += 1) await chef!.locator(".team-grid .chip").nth(index).click();
  await chef!.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await chef!.keyboard.press("Enter");

  // Vote de confiance : O partout.
  for (const page of pages) {
    await expect(page.locator('.card__face--front [data-shortcut="o"]')).toBeEnabled();
    await page.keyboard.press("o");
  }
  await expect(host.getByText(/Majorité POUR/)).toBeVisible({ timeout: 10_000 });
  await host.screenshot({ path: "e2e/screenshots/desktop-01-resultat-vote.png" });
  await host.keyboard.press("?");
  await expect(host.getByRole("dialog", { name: "Raccourcis clavier" })).toBeVisible();
  await host.screenshot({ path: "e2e/screenshots/desktop-02-raccourcis.png" });
  await host.keyboard.press("Escape");

  const results = await new AxeBuilder({ page: host }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(" | ")}`)).toEqual([]);
  for (const page of pages) await page.context().close();
});
