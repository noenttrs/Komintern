import { expect, test } from "@playwright/test";

import { useTestRoomName } from "./testRoom";

// Captures et vérifications de mise en page sur le site déployé (BASE_URL), à plusieurs tailles.
const SIZES = [
  { name: "320", width: 320, height: 640, mobile: true },
  { name: "375", width: 375, height: 812, mobile: true },
  { name: "414", width: 414, height: 896, mobile: true },
  { name: "768", width: 768, height: 1024, mobile: true },
  { name: "1024", width: 1024, height: 768, mobile: false },
  { name: "1440", width: 1440, height: 900, mobile: false },
];

for (const size of SIZES) {
  test.describe(`${size.name}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile });

    test("landing, menu, pages : pas de débordement horizontal", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });

      await page.goto("/");
      await page.evaluate(() => window.localStorage.setItem("komintern.pseudo", "Capture"));
      await page.reload();
      await expect(page.getByRole("heading", { name: "Nazi Communiste" })).toBeVisible();
      const noOverflow = async () =>
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await noOverflow();
      await page.screenshot({ path: `e2e/screenshots/${size.name}-landing.png` });

      await page.getByRole("button", { name: "Ouvrir le menu" }).click();
      await expect(page.getByRole("navigation")).toBeVisible();
      await page.waitForTimeout(350); // fin de l'animation du tiroir
      await page.screenshot({ path: `e2e/screenshots/${size.name}-menu.png` });
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
      await page.waitForTimeout(350);
      await expect(page.getByRole("navigation", { includeHidden: true })).toBeHidden();
      await noOverflow();
      await page.screenshot({ path: `e2e/screenshots/${size.name}-auth.png` });

      for (const [path, title, file] of [
        ["/a-propos", "À propos", "about"],
        ["/mentions-legales", "Mentions légales et confidentialité", "legal"],
        ["/amis", "Amis", "friends"],
        ["/contact", "Contact", "contact"],
        ["/soutenir", "Soutenir le projet", "support"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await noOverflow();
        await page.screenshot({ path: `e2e/screenshots/${size.name}-${file}.png`, fullPage: true });
      }

      await page.goto("/");
      await page.getByRole("button", { name: "Créer une room" }).click();
      await page.getByRole("radio", { name: "À distance" }).click();
      await page.screenshot({ path: `e2e/screenshots/${size.name}-create-room.png` });
      await useTestRoomName(page);
      await page.getByRole("button", { name: "Créer", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Salle d'attente" })).toBeVisible();
      await page.getByRole("button", { name: "Ouvrir le chat" }).click();
      await page.getByLabel("Message").fill("Test de mise en page");
      await page.getByRole("button", { name: "Envoyer" }).click();
      await expect(page.getByText("Test de mise en page")).toBeVisible();
      await noOverflow();
      await page.screenshot({ path: `e2e/screenshots/${size.name}-waiting-chat.png` });

      expect(errors.filter((error) => !error.includes("favicon"))).toEqual([]);
    });
  });
}

test("manifest et service worker de la web app", async ({ page }) => {
  await page.goto("/");
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Nazi Communiste", display: "standalone" });
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);
  const registered = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active !== null;
  });
  expect(registered).toBe(true);
});
