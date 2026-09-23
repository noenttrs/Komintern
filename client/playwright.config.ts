import { defineConfig } from "@playwright/test";

// Tests visuels contre un site déployé. Lancement (sans dépendances système) :
//   docker run --rm --network host -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v<version>-noble \
//     npx playwright test
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: process.env.BASE_URL ?? "https://fascismwontget.me", locale: "fr-FR" },
});
