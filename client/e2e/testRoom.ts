import type { Page } from "@playwright/test";

/**
 * Room de test : nom au préfixe secret du serveur (E2E_ROOM_PREFIX = TEST_ROOM_PREFIX), pour que
 * ses parties ne soient pas enregistrées. Sans préfixe fourni, room ordinaire.
 */
export async function useTestRoomName(page: Page): Promise<void> {
  const prefix = process.env.E2E_ROOM_PREFIX;
  if (prefix === undefined || prefix === "") return;
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "0");
  await page.getByPlaceholder("Nom de room (optionnel)").fill(`${prefix}-${suffix}`);
}
