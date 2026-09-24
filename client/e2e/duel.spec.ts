import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Duel à 2 sur le site déployé : rôle, vote secret, résultat, revanche.

test("duel à 2 joueurs, puis revanche", async ({ browser }) => {
  test.setTimeout(90_000);
  const pages: Page[] = [];
  for (const name of ["Duel1", "Duel2"]) {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, locale: "fr-FR" });
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate((pseudo) => {
      window.localStorage.setItem("komintern.pseudo", pseudo);
      window.localStorage.setItem("komintern.tips_seen", JSON.stringify(["*"]));
    }, name);
    await page.reload();
    pages.push(page);
  }
  const [first, second] = pages as [Page, Page];
  await first.getByRole("button", { name: "Créer une room" }).click();
  await first.getByRole("button", { name: "Créer", exact: true }).click();
  const code = (await first.locator(".room-code").innerText()).replace(/^room\s+/i, "").trim();
  await second.goto(`/r/${code}`);
  await expect(second.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();

  for (let round = 0; round < 2; round += 1) {
    if (round === 0) await first.getByRole("button", { name: "Démarrer" }).click();
    for (const page of pages) {
      await expect(page.getByText("Maintenez pour voir votre rôle")).toBeVisible();
      const box = (await page.locator(".card-zone").boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.35);
      await page.mouse.down();
      await expect(page.locator(".card-overlay")).toContainText("Duel : tu ne sais pas si l'autre est communiste ou nazi");
      await page.mouse.up();
      await page.waitForTimeout(400); // garde anti-mauvais clic après l'appui long
      await page.getByRole("button", { name: "C'est bon" }).first().click();
    }
    await expect(first.getByRole("heading", { name: "Duel2 est-il nazi ?" })).toBeVisible();
    if (round === 0) await first.screenshot({ path: "e2e/screenshots/duel-01-vote.png" });
    await first.getByRole("button", { name: "Nazi !" }).click();
    await expect(second.getByText("Duel1 a voté.").first()).toBeVisible();
    await second.getByRole("button", { name: "Confiance" }).click();
    for (const page of pages) {
      await expect(page.getByRole("heading", { name: /Tu as (gagné|perdu)/ })).toBeVisible();
      await expect(page.locator(".duel-roles li")).toHaveCount(2);
    }
    if (round === 0) await first.screenshot({ path: "e2e/screenshots/duel-02-resultat.png" });
    for (const page of pages) await page.getByRole("button", { name: "Rejouer" }).first().click();
  }
});
