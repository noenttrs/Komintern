import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Un joueur ferme l'app en pleine partie : les autres choisissent de l'attendre, puis il revient
// par le lien de la room (onglet neuf, comme depuis une notification) et retrouve sa place.

async function tapCard(page: Page): Promise<void> {
  const box = await page.locator(".card-zone").boundingBox();
  if (box === null) throw new Error("no card on screen");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.35);
}

test("attendre un joueur déconnecté, puis il revient à sa place", async ({ browser }) => {
  test.setTimeout(120_000);
  const pages: Page[] = [];
  for (let index = 0; index < 5; index += 1) {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, locale: "fr-FR" });
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate((pseudo) => {
      window.localStorage.setItem("komintern.pseudo", pseudo);
      window.localStorage.setItem("komintern.tips_seen", JSON.stringify(["*"]));
    }, `Absent${index + 1}`);
    await page.reload();
    pages.push(page);
  }
  const [host, , , , gone] = pages as [Page, Page, Page, Page, Page];
  await host.getByRole("button", { name: "Créer une room" }).click();
  await host.getByRole("button", { name: "Créer", exact: true }).click();
  const code = (await host.locator(".room-code").innerText()).replace(/^room\s+/i, "").trim();
  for (const page of pages.slice(1)) {
    await page.goto(`/r/${code}`);
    await expect(page.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
  }
  await host.getByRole("button", { name: "Démarrer" }).click();
  for (const page of pages) {
    await expect(page.getByText("Touchez pour prendre votre numéro d'ordre")).toBeVisible();
    await tapCard(page);
  }
  // Ordre complet : validé seul après le compte à rebours ; toucher l'écran accélère.
  await expect(pages[0]!.getByText(/Suite dans \d+ s/)).toBeVisible();
  for (const page of pages) {
    if (await page.getByText(/Suite dans \d+ s/).isVisible().catch(() => false)) await tapCard(page);
  }
  for (const page of pages) {
    await expect(page.getByText("Maintenez pour voir votre rôle")).toBeVisible();
    const box = (await page.locator(".card-zone").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.35);
    await page.mouse.down();
    await expect(page.locator(".card-overlay")).toBeVisible();
    await page.mouse.up();
    await page.waitForTimeout(800); // garde anti-mauvais clic après l'appui long
  }

  // Le joueur 5 ferme l'app.
  const context = gone.context();
  await gone.close();
  const prompt = host.getByRole("alertdialog");
  await expect(prompt).toContainText("Absent5 s'est déconnecté", { timeout: 60_000 });
  await expect(prompt).toContainText("son camp perd la partie");
  await host.screenshot({ path: "e2e/screenshots/absence-01-popup.png" });
  await host.getByRole("button", { name: "Attendre Absent5" }).click();
  for (const page of pages.slice(0, 4)) {
    await expect(page.getByRole("status").filter({ hasText: "Absent1 attend Absent5" })).toBeVisible();
  }
  await pages[1]!.screenshot({ path: "e2e/screenshots/absence-02-attente.png" });

  // Il revient par le lien de la room, dans un onglet neuf : même siège, pas un nouveau joueur.
  const back = await context.newPage();
  await back.goto(`/r/${code}`);
  await expect(back.locator(".card-zone")).toBeVisible({ timeout: 15_000 });
  await expect(back.getByRole("heading", { name: "Salle d'attente" })).toHaveCount(0);
  for (const page of pages.slice(0, 4)) {
    await expect(page.locator(".absence-stack")).toHaveCount(0);
  }
});
