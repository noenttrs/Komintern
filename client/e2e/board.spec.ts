import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import { useTestRoomName } from "./testRoom";

// Vue publique (grand écran, OBS) : suit la room sans siège, n'affiche jamais de rôle.

async function player(browser: Browser, pseudo: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "fr-FR" });
  const page = await context.newPage();
  await page.goto("/");
  await page.evaluate((name) => {
    window.localStorage.setItem("komintern.pseudo", name);
    window.localStorage.setItem("komintern.tips_seen", JSON.stringify(["*"]));
  }, pseudo);
  await page.reload();
  return page;
}

test("la vue publique suit le salon puis la partie, et le lien stream cache le code", async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await player(browser, "Ecran1");
  await host.getByRole("button", { name: "Créer une room" }).click();
  await useTestRoomName(host);
  await host.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(host.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
  const code = (await host.locator(".room-code").innerText()).replace(/^room\s+/i, "").trim();
  for (const name of ["Ecran2", "Ecran3"]) {
    const guest = await player(browser, name);
    await guest.goto(`/r/${code}`);
    await expect(guest.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
  }

  await host.getByRole("button", { name: "Paramètres de la room" }).click();
  await host.getByRole("button", { name: "Obtenir les liens de la vue publique" }).click();
  const screenUrl = await host.getByRole("link", { name: "Ouvrir" }).getAttribute("href");
  expect(screenUrl).toContain(`/r/${code}/ecran?t=`);
  await host.getByRole("button", { name: "OK" }).click();

  const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "fr-FR" })).newPage();
  await tv.goto(screenUrl!);
  await expect(tv.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
  await expect(tv.getByText("Ecran3")).toBeVisible();
  await expect(tv.getByAltText(/QR code pour rejoindre/)).toBeVisible();
  await tv.screenshot({ path: "e2e/screenshots/board-01-salon.png" });

  const stream = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "fr-FR" })).newPage();
  await stream.goto(`${screenUrl}&stream=1`);
  await expect(stream.getByText("Ecran2")).toBeVisible();
  await expect(stream.getByAltText(/QR code/)).toHaveCount(0);
  expect(await stream.locator("body").innerText()).not.toContain(code);

  await host.getByRole("button", { name: "Démarrer" }).click();
  await expect(tv.getByRole("heading", { name: "Tour de table" })).toBeVisible();
  await tv.screenshot({ path: "e2e/screenshots/board-02-tour-de-table.png" });
  await expect(tv.locator(".card-overlay, .card-zone")).toHaveCount(0);

  // Un faux jeton : l'écran l'annonce au lieu d'afficher quoi que ce soit.
  const bad = await (await browser.newContext()).newPage();
  await bad.goto(`/r/${code}/ecran?t=nope`);
  await expect(bad.getByText(/n'est plus valide/)).toBeVisible();
});
