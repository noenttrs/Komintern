import { expect, test } from "@playwright/test";

// Référencement : HTML servi avant le JavaScript (ce que lisent les moteurs de recherche).
const PAGES = [
  { path: "/", title: /Jeu de bluff en ligne/, text: "Les deux camps" },
  { path: "/regles", title: /^Règles du jeu/, text: "Vote de confiance" },
  { path: "/a-propos", title: /^À propos/, text: "déduction sociale" },
  { path: "/soutenir", title: /^Soutenir le projet/, text: "sans publicité" },
  { path: "/contact", title: /^Contact/, text: "Message" },
  { path: "/conditions-utilisation", title: /^Conditions d'utilisation/, text: "Règles de conduite" },
  { path: "/mentions-legales", title: /^Mentions légales/, text: "Hébergement" },
];

for (const entry of PAGES) {
  test(`HTML propre à ${entry.path}`, async ({ request, baseURL }) => {
    const response = await request.get(entry.path);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-robots-tag"]).toBeUndefined();
    const html = await response.text();
    expect(html.match(/<title>([^<]*)<\/title>/)?.[1]).toMatch(entry.title);
    expect(html).toContain(`<link rel="canonical" href="${new URL(entry.path, baseURL).href}"`);
    expect(html).toContain(entry.text);
    expect(html.includes("application/ld+json")).toBe(entry.path === "/");
  });
}

test("adresse inconnue : vraie 404", async ({ request }) => {
  const response = await request.get("/nimporte-quoi");
  expect(response.status()).toBe(404);
  expect(await response.text()).toContain("Page introuvable");
});

test("pages de l'application : jamais indexées", async ({ request }) => {
  for (const path of ["/r/ABCD1234", "/admin", "/moderation", "/connexion", "/profil", "/amis"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["x-robots-tag"], path).toContain("noindex");
  }
});

test("sitemap : pages publiques seulement", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml.match(/<loc>/g)).toHaveLength(PAGES.length);
  for (const entry of PAGES) expect(xml).toContain(`<loc>https://fascismwontget.me${entry.path}</loc>`);
});

test("page prérendue : l'application prend le relais", async ({ page }) => {
  await page.goto("/regles");
  await expect(page.getByRole("heading", { name: "Règles du jeu" })).toBeVisible();
  await page.getByRole("button", { name: /Retour/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle(/Jeu de bluff en ligne/);
});

test("manifest : installation enrichie (captures, raccourcis, identifiant)", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.id).toBe("/");
  expect(manifest.categories).toContain("games");
  expect(manifest.screenshots.some((shot: { form_factor: string }) => shot.form_factor === "wide")).toBe(true);
  expect(manifest.screenshots.some((shot: { form_factor: string }) => shot.form_factor === "narrow")).toBe(true);
  for (const shot of manifest.screenshots as Array<{ src: string }>) expect((await request.get(shot.src)).status(), shot.src).toBe(200);
  expect(manifest.shortcuts.map((entry: { url: string }) => entry.url)).toEqual(["/?action=creer", "/?action=rejoindre", "/regles"]);
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);
});

test("raccourci de l'app : « Créer une room » ouvre directement la création", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem("komintern.pseudo", "Raccourci"));
  await page.goto("/?action=creer");
  await expect(page.getByPlaceholder("Nom de room (optionnel)")).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
});
