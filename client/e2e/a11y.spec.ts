import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import { useTestRoomName } from "./testRoom";

// Accessibilité (WCAG 2.2 A/AA, règles axe-core) sur les écrans principaux, en thème clair et sombre.
// Chaque violation est listée avec les éléments en cause pour être corrigée, jamais ignorée.

async function audit(page: Page, name: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const summary = results.violations.map((violation) => `${violation.id} (${violation.impact}) : ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 5).join(" | ")}`);
  expect.soft(summary, `${name}\n${summary.join("\n")}`).toEqual([]);
}

async function withPseudo(page: Page, pseudo: string): Promise<void> {
  await page.goto("/");
  await page.evaluate((name) => window.localStorage.setItem("komintern.pseudo", name), pseudo);
  await page.reload();
}

async function dismissTip(page: Page): Promise<void> {
  const tip = page.getByRole("button", { name: "Compris" });
  if (await tip.isVisible().catch(() => false)) await tip.click({ timeout: 2_000 }).catch(() => undefined);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`thème ${scheme === "light" ? "clair" : "sombre"}`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("pages et menu", async ({ page }) => {
      await page.goto("/");
      await audit(page, "choix du pseudo");
      await withPseudo(page, "Access1");
      await expect(page.getByRole("button", { name: "Créer une room" })).toBeVisible();
      await audit(page, "accueil");
      await page.screenshot({ path: `e2e/screenshots/a11y-accueil-${scheme}.png` });
      await page.getByRole("button", { name: "Ouvrir le menu" }).click();
      await audit(page, "menu");
      for (const path of ["/regles", "/a-propos", "/soutenir", "/contact", "/conditions-utilisation", "/mentions-legales", "/connexion"]) {
        await page.goto(path);
        await expect(page.locator(".page-layer")).toBeVisible();
        await audit(page, path);
      }
    });

    test("création de room et salle d'attente", async ({ page }) => {
      await withPseudo(page, "Access1");
      await page.getByRole("button", { name: "Créer une room" }).click();
      await audit(page, "création de room");
      await useTestRoomName(page);
      await page.getByRole("button", { name: "Créer", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
      await audit(page, "salle d'attente");
    });
  });
}

async function openPlayers(browser: Browser, count: number): Promise<Page[]> {
  const pages: Page[] = [];
  for (let index = 0; index < count; index += 1) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: index % 2 === 0 ? "light" : "dark" });
    pages.push(await context.newPage());
  }
  return pages;
}

test("écrans de partie (tour de table, rôle, proposition, vote)", async ({ browser }) => {
  test.setTimeout(120_000);
  const pages = await openPlayers(browser, 4);
  const [host, ...guests] = pages as [Page, ...Page[]];
  for (const [index, page] of pages.entries()) await withPseudo(page, `Access${index + 1}`);
  await host.getByRole("button", { name: "Créer une room" }).click();
  await useTestRoomName(host);
  await host.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(host.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
  const code = (await host.locator(".room-code").innerText()).replace(/^room\s+/i, "").trim();
  for (const guest of guests) {
    await guest.goto(`/r/${code}`);
    await expect(guest.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
  }
  await expect(host.getByRole("button", { name: "Démarrer" })).toBeEnabled();
  await host.getByRole("button", { name: "Démarrer" }).click();

  for (const page of pages) {
    await expect(page.getByText("Touchez l'écran quand c'est votre tour")).toBeVisible();
    await dismissTip(page);
  }
  await audit(host, "tour de table (clair)");
  await audit(guests[0] as Page, "tour de table (sombre)");
  // Au clavier : le bouton « Prendre ma place » apparaît au focus.
  await host.getByRole("button", { name: "Prendre ma place" }).first().focus();
  await host.keyboard.press("Enter");
  await expect(host.getByText(/Votre numéro d'ordre/)).toBeVisible();
  await host.screenshot({ path: "e2e/screenshots/a11y-tour-de-table-clair.png" });
  for (const page of guests) {
    const box = (await page.locator(".card-zone").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.35);
    await expect(page.getByText(/Votre numéro d'ordre/)).toBeVisible();
  }
  await (guests[0] as Page).screenshot({ path: "e2e/screenshots/a11y-tour-de-table-sombre.png" });
  for (const page of pages) {
    await expect(page.getByText("Maintenez pour voir votre rôle")).toBeVisible({ timeout: 15_000 });
    await dismissTip(page);
  }
  await audit(host, "révélation du rôle (clair)");
  await audit(guests[0] as Page, "révélation du rôle (sombre)");
  // Au clavier : maintenir Espace sur « Voir mon rôle » montre le rôle, le relâcher le cache.
  await host.getByRole("button", { name: "Voir mon rôle (maintenir)" }).first().focus();
  await host.keyboard.down(" ");
  await expect(host.locator(".card-overlay")).toBeVisible();
  await audit(host, "rôle affiché");
  await host.keyboard.up(" ");
  await expect(host.locator(".card-overlay")).toHaveCount(0);
  for (const page of guests) {
    const box = (await page.locator(".card-zone").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.35);
    await page.mouse.down();
    await expect(page.locator(".card-overlay")).toBeVisible();
    if (page === guests[0]) await page.screenshot({ path: "e2e/screenshots/a11y-role-sombre.png" });
    await page.mouse.up();
    await page.waitForTimeout(800);
  }

  let chef: Page | undefined;
  await expect.poll(async () => {
    for (const page of pages) {
      if (await page.getByText(/Choisir l'équipe/).isVisible()) {
        chef = page;
        return true;
      }
    }
    return false;
  }, { timeout: 15_000 }).toBe(true);
  await dismissTip(chef!);
  await audit(chef!, "proposition (chef)");
  const size = Number((await chef!.getByText(/Choisir l'équipe/).innerText()).match(/\d+/)?.[0]);
  const chips = chef!.locator(".team-grid .chip");
  for (let index = 0; index < size; index += 1) await chips.nth(index).click();
  await chef!.getByRole("button", { name: "Proposer l'équipe" }).first().click();
  for (const page of pages) {
    await expect(page.getByRole("heading", { name: "Vote de confiance" }).first()).toBeVisible();
    await dismissTip(page);
  }
  await audit(host, "vote de confiance (clair)");
  await audit(guests[0] as Page, "vote de confiance (sombre)");
  await (guests[0] as Page).screenshot({ path: "e2e/screenshots/a11y-vote-sombre.png" });
  for (const page of pages) await page.context().close();
});
