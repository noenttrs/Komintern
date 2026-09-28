import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import { useTestRoomName } from "./testRoom";

// Mode streamer (ordinateur) : la fenêtre capturée ne montre ni code ni rôle, la fenêtre privée
// les reçoit ; l'hôte en mode streamer admet les nouveaux venus sur demande et peut changer le code.

async function withPseudo(page: Page, pseudo: string): Promise<void> {
  await page.goto("/");
  await page.evaluate((name) => {
    window.localStorage.setItem("komintern.pseudo", name);
    window.localStorage.setItem("komintern.tips_seen", JSON.stringify(["*"]));
  }, pseudo);
  await page.reload();
}

async function phone(browser: Browser, pseudo: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "fr-FR" })).newPage();
  await withPseudo(page, pseudo);
  return page;
}

test("mode streamer : secrets hors de la fenêtre capturée, admission sur demande, nouveau code", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const host = await context.newPage();
  await withPseudo(host, "Streamer");
  host.on("dialog", (dialog) => void dialog.accept());

  await host.getByRole("button", { name: "Ouvrir le menu" }).click();
  await host.getByLabel("Mode streamer").check();
  await expect(host.getByRole("dialog", { name: "Mode streamer" })).toBeVisible();
  await host.screenshot({ path: "e2e/screenshots/streamer-01-guide.png" });
  await host.getByRole("button", { name: "Compris" }).click();
  await host.getByRole("button", { name: "Fermer le menu" }).click();

  await host.getByRole("button", { name: "Créer une room" }).click();
  await useTestRoomName(host);
  await host.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(host.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
  const code = await host.evaluate(() => window.sessionStorage.getItem("komintern.room_code") ?? "");
  expect(code.length).toBeGreaterThan(5);
  // Ni le code ni le QR dans la fenêtre capturée ; admission sur demande d'office.
  await expect(host.getByText("Room ••••••••")).toBeVisible();
  expect(await host.locator("body").innerText()).not.toContain(code);
  await expect(host.getByText(/Admission sur demande/)).toBeVisible();
  await host.screenshot({ path: "e2e/screenshots/streamer-02-salon.png" });

  // Un nouveau venu attend ; l'hôte l'accepte.
  const guest = await phone(browser, "Viewer");
  await guest.goto(`/r/${code}`);
  await expect(guest.getByRole("heading", { name: "En attente de l'hôte" })).toBeVisible();
  await expect(host.getByText("Demandes pour entrer")).toBeVisible();
  await host.screenshot({ path: "e2e/screenshots/streamer-03-demande.png" });
  await host.getByRole("button", { name: "Accepter" }).click();
  await expect(guest.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();

  // Fenêtre privée : le code n'y paraît qu'en maintenant le bouton.
  const privatePage = await context.newPage();
  await privatePage.goto("/prive");
  const hold = privatePage.getByRole("button", { name: /Maintenir pour voir/ });
  await expect(hold).toBeVisible();
  expect(await privatePage.locator("body").innerText()).not.toContain(code);
  const box = (await hold.boundingBox())!;
  await privatePage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await privatePage.mouse.down();
  await expect(privatePage.getByText(`Room ${code}`)).toBeVisible();
  await privatePage.mouse.up();
  await expect(privatePage.getByText(`Room ${code}`)).toHaveCount(0);

  // Duel à 2 : le rôle ne s'affiche jamais dans la fenêtre du jeu, mais dans la fenêtre privée.
  await host.getByRole("button", { name: "Démarrer" }).click();
  await expect(host.getByText("Maintenez pour voir votre rôle")).toBeVisible();
  const card = (await host.locator(".card-zone").boundingBox())!;
  await host.mouse.move(card.x + card.width / 2, card.y + card.height * 0.35);
  await host.mouse.down();
  await expect(host.locator(".card-overlay")).toContainText("votre rôle est dans la fenêtre privée");
  await host.screenshot({ path: "e2e/screenshots/streamer-04-role-masque.png" });
  await host.mouse.up();
  await privatePage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await privatePage.mouse.down();
  await expect(privatePage.locator(".private-window__secret strong")).toHaveText(/Nazi|Communiste/);
  await privatePage.screenshot({ path: "e2e/screenshots/streamer-05-fenetre-privee.png" });
  await privatePage.mouse.up();
});

test("l'hôte change le code : l'ancien lien ne marche plus, les joueurs restent", async ({ browser }) => {
  const host = await phone(browser, "Hote");
  host.on("dialog", (dialog) => void dialog.accept());
  await host.getByRole("button", { name: "Créer une room" }).click();
  await useTestRoomName(host);
  await host.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(host.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
  const oldCode = (await host.locator(".room-code").innerText()).replace(/^room\s+/i, "").trim();
  const guest = await phone(browser, "Invite");
  await guest.goto(`/r/${oldCode}`);
  await expect(guest.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();

  await host.getByRole("button", { name: "Paramètres de la room" }).click();
  await host.getByRole("button", { name: "Nouveau code de room" }).click();
  await host.getByRole("button", { name: "OK" }).click();
  await expect(host.locator(".room-code")).not.toContainText(oldCode);
  await expect(guest.getByText(/Nouveau code de room/)).toBeVisible();
  await expect(guest.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();

  const late = await phone(browser, "Retard");
  await late.goto(`/r/${oldCode}`);
  await expect(late.getByText(/introuvable|n'existe/i)).toBeVisible();
});
