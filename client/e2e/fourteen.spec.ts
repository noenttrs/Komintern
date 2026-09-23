import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Soirée à 14, partie rapide : le salon, l'ordre de table, la proposition d'équipe (14 noms)
// et les votes doivent tenir sur un écran de téléphone.

async function layoutProblems(page: Page): Promise<string[]> {
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const found: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) found.push(`horizontal overflow ${document.documentElement.scrollWidth}`);
    const card = document.querySelector(".card-zone");
    if (card !== null && card.getBoundingClientRect().bottom > window.innerHeight + 1) found.push("card cut at the bottom");
    const cardBottom = card === null ? window.innerHeight : Math.min(window.innerHeight, card.getBoundingClientRect().bottom);
    for (const el of document.querySelectorAll(".card__face--front button, .panel > button")) {
      const r = el.getBoundingClientRect();
      const limit = el.closest(".card-zone") !== null ? cardBottom : window.innerHeight;
      if (r.width > 0 && (r.bottom > limit + 1 || r.top < -1)) found.push(`"${(el.textContent ?? "").trim().slice(0, 30)}" cut or off-screen`);
    }
    return found;
  });
}

async function tapCard(page: Page): Promise<void> {
  const box = await page.locator(".card-zone").boundingBox();
  if (box === null) throw new Error("no card on screen");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.35);
}

test("partie rapide à 14 joueurs sur téléphone", async ({ browser }) => {
  test.setTimeout(240_000);
  const pages: Page[] = [];
  for (let index = 0; index < 14; index += 1) {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, locale: "fr-FR" });
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate((pseudo) => {
      window.localStorage.setItem("komintern.pseudo", pseudo);
      window.localStorage.setItem("komintern.tips_seen", JSON.stringify(["*"]));
    }, `Joueur${String(index + 1).padStart(2, "0")}`);
    await page.reload();
    pages.push(page);
  }
  const [host] = pages as [Page];
  await host.getByRole("button", { name: "Creer une room" }).click();
  await host.getByRole("button", { name: "Creer", exact: true }).click();
  const code = (await host.locator(".room-code").innerText()).replace(/^room\s+/i, "").trim();
  for (const page of pages.slice(1)) {
    await page.goto(`/r/${code}`);
    await expect(page.getByRole("heading", { name: "Salle d attente" })).toBeVisible();
  }
  await expect(host.getByText("14 joueurs · de 2 à 14")).toBeVisible();
  // Partie rapide : proposée à l'hôte dans le salon, à partir de 6 joueurs.
  await host.getByRole("radio", { name: "Rapide" }).click();
  await host.screenshot({ path: "e2e/screenshots/fourteen-01-salon.png" });
  expect(await layoutProblems(host)).toEqual([]);

  await host.getByRole("button", { name: "Demarrer" }).click();
  for (const page of pages) {
    await expect(page.getByText("Tap pour prendre votre numero d'ordre")).toBeVisible();
    await tapCard(page);
  }
  for (const page of pages) {
    await expect(page.getByText("Tap pour passer a la suite (confirmation collective)")).toBeVisible();
    await tapCard(page);
  }
  for (const page of pages) {
    await expect(page.getByText("Maintenez pour voir votre role")).toBeVisible();
    const box = (await page.locator(".card-zone").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.35);
    await page.mouse.down();
    await expect(page.locator(".card-overlay")).toBeVisible();
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "C'est bon" }).first().click();
  }

  // Proposition : 14 noms à choisir, équipe de 5 (partie rapide à 14)
  let chef: Page | undefined;
  await expect.poll(async () => {
    for (const page of pages) {
      if (await page.getByText(/Choisir equipe/).isVisible()) {
        chef = page;
        return true;
      }
    }
    return false;
  }, { timeout: 20_000 }).toBe(true);
  const teamSize = Number((await chef!.getByText(/Choisir equipe/).innerText()).match(/\d+/)?.[0]);
  expect(teamSize).toBe(5);
  const chips = chef!.locator(".team-grid .chip");
  await expect(chips).toHaveCount(14);
  for (let index = 0; index < teamSize; index += 1) await chips.nth(index).click();
  await chef!.screenshot({ path: "e2e/screenshots/fourteen-02-proposition.png" });
  expect(await layoutProblems(chef!)).toEqual([]);
  await chef!.getByRole("button", { name: "Proposer equipe" }).first().click();

  for (const page of pages) {
    await expect(page.getByRole("heading", { name: "Vote de confiance" }).first()).toBeVisible();
  }
  await pages[1]!.screenshot({ path: "e2e/screenshots/fourteen-03-vote.png" });
  expect(await layoutProblems(pages[1]!)).toEqual([]);
});
