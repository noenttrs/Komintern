import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

// Partie complète à 5 sur le site déployé, chaque joueur dans son propre navigateur mobile.
// À chaque écran : captures, pas de débordement horizontal, et ni le bouton du menu ni celui
// du chat ne recouvrent un bouton de jeu.

// 375 px : partie à distance (chat) ; 320 px : partie sur place (sans chat).
const DEVICES = [
  { name: "375x667", width: 375, height: 667, remote: true },
  { name: "320x568", width: 320, height: 568, remote: false },
];

type Player = { page: Page; name: string };

async function openPlayers(browser: Browser, size: { width: number; height: number }): Promise<Player[]> {
  const players: Player[] = [];
  for (let index = 0; index < 5; index += 1) {
    const context = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true, locale: "fr-FR" });
    const page = await context.newPage();
    const name = `Testeur${index + 1}`;
    await page.goto("/");
    await page.evaluate((pseudo) => window.localStorage.setItem("komintern.pseudo", pseudo), name);
    await page.reload();
    players.push({ page, name });
  }
  return players;
}

/** Vérifie la mise en page de l'écran courant et fait une capture. */
async function check(page: Page, file: string): Promise<void> {
  await page.waitForTimeout(250);
  const problems = await page.evaluate(() => {
    const found: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      found.push(`horizontal overflow ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    }
    const rect = (el: Element) => el.getBoundingClientRect();
    const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const card = document.querySelector(".card-zone");
    if (card !== null && rect(card).bottom > window.innerHeight + 1) {
      found.push(`card cut at the bottom (${Math.round(rect(card).bottom)} > ${window.innerHeight})`);
    }
    const floating = [...document.querySelectorAll(".menu-toggle, .chat-toggle")].map(rect);
    // Les listes défilantes (joueurs du salon) peuvent sortir de l'écran ; pas les actions principales.
    const controls = [...document.querySelectorAll(".card__face--front button, .panel button, .card__face--front input")].filter((el) => {
      if (el.closest(".lobby-players") !== null) return false;
      const r = rect(el);
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    });
    for (const control of controls) {
      for (const box of floating) {
        if (overlaps(rect(control), box)) {
          found.push(`"${(control.textContent ?? "").trim().slice(0, 30)}" is covered by a floating button`);
        }
      }
      const r = rect(control);
      if (r.bottom > window.innerHeight + 1 || r.top < -1) {
        found.push(`"${(control.textContent ?? "").trim().slice(0, 30)}" is off-screen (${Math.round(r.top)}-${Math.round(r.bottom)})`);
      }
    }
    return found;
  });
  await page.screenshot({ path: `e2e/screenshots/game-${file}.png` });
  expect(problems, file).toEqual([]);
}

async function tapCard(page: Page): Promise<void> {
  const box = await page.locator(".card-zone").boundingBox();
  if (box === null) throw new Error("no card on screen");
  // Zone de texte au tiers supérieur de la carte, loin des boutons d'action.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.35);
}

for (const device of DEVICES) {
  test(`partie complète à 5 joueurs — ${device.name}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const players = await openPlayers(browser, device);
    const [host, ...guests] = players as [Player, ...Player[]];
    const tag = (step: string) => `${device.name}-${step}`;

    // Salle d'attente
    await host.page.getByRole("button", { name: "Creer une room" }).click();
    if (device.remote) await host.page.getByRole("radio", { name: "À distance" }).click();
    await host.page.getByRole("button", { name: "Creer", exact: true }).click();
    const code = (await host.page.locator(".room-code").innerText()).replace(/^room\s+/i, "").trim();
    for (const [index, guest] of guests.entries()) {
      if (index % 2 === 0) {
        // Lien d'invitation (équivalent du scan du QR code)
        await guest.page.goto(`/r/${code}`);
      } else {
        await guest.page.getByRole("button", { name: "Rejoindre une room" }).click();
        await guest.page.getByPlaceholder("Code room").fill(code);
        await guest.page.getByRole("button", { name: "Rejoindre", exact: true }).click();
      }
      await expect(guest.page.getByRole("heading", { name: "Salle d attente" })).toBeVisible();
    }
    await host.page.getByRole("button", { name: "QR code" }).click();
    await expect(host.page.getByAltText(/QR code pour rejoindre/)).toBeVisible();
    await host.page.screenshot({ path: `e2e/screenshots/game-${device.name}-00-qr.png` });
    await host.page.getByRole("button", { name: "Fermer" }).click();
    await expect(host.page.getByRole("button", { name: "Demarrer" })).toBeEnabled();
    await check(host.page, tag("01-salle-attente"));

    // Chat : présent à distance, absent sur place
    if (device.remote) {
      await guests[0]!.page.getByRole("button", { name: "Ouvrir le chat" }).click();
      await guests[0]!.page.getByLabel("Message").fill("On joue ?");
      await guests[0]!.page.getByRole("button", { name: "Envoyer" }).click();
      await expect(host.page.getByRole("button", { name: "Ouvrir le chat" })).toContainText("1");
      await guests[0]!.page.getByRole("button", { name: "Replier le chat" }).click();
    } else {
      for (const player of players) {
        await expect(player.page.getByRole("button", { name: "Ouvrir le chat" })).toHaveCount(0);
      }
    }

    // Ordre de table
    await host.page.getByRole("button", { name: "Demarrer" }).click();
    for (const player of players) {
      await expect(player.page.getByText("Tap pour prendre votre numero d'ordre")).toBeVisible();
    }
    await check(host.page, tag("02-ordre-table"));
    for (const player of players) {
      await tapCard(player.page);
      await expect(player.page.getByText(/Votre numero d'ordre/)).toBeVisible();
    }
    for (const player of players) {
      await expect(player.page.getByText("Tap pour passer a la suite (confirmation collective)")).toBeVisible();
    }
    await check(host.page, tag("03-ordre-complet"));
    for (const player of players) {
      await tapCard(player.page);
    }

    // Révélation des rôles (appui long)
    for (const [index, player] of players.entries()) {
      await expect(player.page.getByText("Maintenez pour voir votre role")).toBeVisible();
      const box = (await player.page.locator(".card-zone").boundingBox())!;
      await player.page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.35);
      await player.page.mouse.down();
      await expect(player.page.locator(".card-overlay")).toBeVisible();
      if (index === 0) await check(player.page, tag("04-role-maintenu"));
      await player.page.mouse.up();
      await player.page.getByRole("button", { name: "C'est bon" }).first().click();
    }

    // Manches jusqu'à la fin de la partie
    for (let round = 1; round <= 5; round += 1) {
      let chef: Player | undefined;
      await expect.poll(async () => {
        for (const player of players) {
          if (await player.page.getByText(/Choisir equipe/).isVisible()) {
            chef = player;
            return true;
          }
        }
        return false;
      }).toBe(true);
      const teamSize = Number((await chef!.page.getByText(/Choisir equipe/).innerText()).match(/\d+/)?.[0]);
      if (round === 1) await check(chef!.page, tag("05-proposition-chef"));
      const chips = chef!.page.locator(".team-grid .chip");
      for (let index = 0; index < teamSize; index += 1) await chips.nth(index).click();
      await chef!.page.getByRole("button", { name: "Proposer equipe" }).first().click();

      for (const [index, player] of players.entries()) {
        await expect(player.page.getByRole("heading", { name: "Vote de confiance" })).toBeVisible();
        if (round === 1 && index === 0) await check(player.page, tag("06-vote-confiance"));
        await player.page.getByRole("button", { name: "✓" }).first().click();
      }
      for (const [index, player] of players.entries()) {
        await expect(player.page.getByText("Majorite POUR")).toBeVisible();
        if (round === 1 && index === 0) await check(player.page, tag("07-resultat-confiance"));
        await tapCard(player.page);
      }

      // Mission : chaque membre vote communiste (icône à viewBox 0 0 24 24)
      for (const [index, player] of players.entries()) {
        // Écran de mission affiché : boutons de vote (membre de l'équipe) ou carte d'attente.
        await expect(player.page.getByText(/Majorite POUR|Validation envoyee/)).toHaveCount(0);
        await expect(
          player.page
            .locator(".vote-stack--split")
            .or(player.page.getByText("En attente.", { exact: true }))
            .or(player.page.getByText(/Victoire (Nazi|Communiste)/))
            .first(),
        ).toBeVisible();
        const communist = player.page.locator('.vote-stack button:has(svg[viewBox="0 0 24 24"])').first();
        if (await communist.isVisible().catch(() => false)) {
          if (round === 1) await check(player.page, tag(`08-mission-vote-${index}`));
          await communist.click();
        }
      }
      for (const [index, player] of players.entries()) {
        await expect(player.page.getByText(/Victoire (Nazi|Communiste)/).first()).toBeVisible();
        if (index === 0 && round === 1) {
          await expect(player.page.getByText(/Mission 1 \/ 5/).first()).toBeVisible();
          await check(player.page, tag("09-resultat-mission"));
        }
      }
      const over = await host.page.getByRole("button", { name: "Rejouer" }).first().isVisible().catch(() => false);
      for (const player of players) {
        if (await player.page.getByText("Tap pour passer a la suite.").isVisible().catch(() => false)) {
          await tapCard(player.page);
        }
      }
      await host.page.waitForTimeout(400);
      if (over || (await host.page.getByRole("button", { name: "Rejouer" }).first().isVisible().catch(() => false))) break;
    }

    // Fin de partie
    await expect(host.page.getByRole("button", { name: "Rejouer" }).first()).toBeVisible();
    await check(host.page, tag("10-fin-partie"));
    for (const player of players) {
      await player.page.getByRole("button", { name: "Rejouer" }).first().click();
    }
    await expect(host.page.getByText("Tap pour prendre votre numero d'ordre")).toBeVisible({ timeout: 15_000 });

    // Rechargement en pleine partie : on retrouve sa place
    await guests[1]!.page.reload();
    await expect(guests[1]!.page.getByText(/Tap pour prendre votre numero d'ordre|Votre numero d'ordre/)).toBeVisible();
    await check(guests[1]!.page, tag("11-apres-rechargement"));

    for (const player of players) await player.page.context().close();
  });
}
