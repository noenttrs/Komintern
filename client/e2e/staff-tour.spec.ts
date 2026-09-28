import { test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Visite guidée des panels d'équipe (admin, modération) avec des données d'exemple :
// les vraies pages demandent un compte et un code 2FA. Lancée avec TOUR=1.

const OUT = "e2e/screenshots/tour";
test.skip(!process.env.TOUR, "visite guidée : TOUR=1 pour la lancer");

const now = "2026-09-23T20:00:00Z";
const caseEntry = {
  id: "case_1",
  createdAt: now,
  status: "open",
  trigger: { type: "flagged_word", words: ["je sais ou tu habites"], categories: ["menaces"] },
  messages: [
    { pseudonym: "Joueur B", text: "t'es sûr pour la mission ?", at: "2026-09-23T19:58:00Z", flagged: false },
    { pseudonym: "Joueur A", text: "je sais où tu habites Joueur B", at: now, flagged: true },
    { pseudonym: "Joueur C", text: "calmez-vous", at: "2026-09-23T20:00:30Z", flagged: false },
  ],
  resolution: null,
};
const games = Array.from({ length: 8 }, (_, i) => ({
  id: `g${i}`, endedAt: `2026-09-23T1${i}:00:00Z`, durationSeconds: 900 + i * 240, playerCount: [5, 7, 14, 2, 9, 14, 3, 11][i], accounts: i % 4,
  mode: i === 3 ? "duel" : "missions", format: i === 3 ? "duel" : i === 5 ? "14J_RAPIDE" : `${[5, 7, 14, 2, 9, 14, 3, 11][i]}J`,
  outcome: i === 4 ? "aborted" : "finished", winner: i % 2 ? "nazi" : "communist", reason: i === 6 ? "forfeit" : "missions",
  duelWinners: i === 3 ? 1 : null, missions: i === 3 ? [] : ["communist", "nazi", "communist", "nazi", "communist", "communist", "nazi"].slice(0, 3 + (i % 5)), chatMessages: i * 9, moderated: i === 2,
}));
const users = [
  { id: "u1", displayName: "Karl", email: "karl@example.org", createdAt: "2026-09-01T00:00:00Z", bannedUntil: null, banReason: null, warnings: [{ id: "w1", at: now, reason: "Chat coupé 24 h : menaces", seen: false }], gamesPlayed: 12, role: null, permanentBan: false, chatMutedUntil: "2026-09-24T20:00:00Z", sanctions: [{ id: "s1", type: "mute", at: now, until: "2026-09-24T20:00:00Z", reason: "Menaces", by: "Modo (modérateur)", revoked: false }] },
  { id: "u2", displayName: "Nestor", email: "nestor@example.org", createdAt: "2026-08-15T00:00:00Z", bannedUntil: "9999-12-31T00:00:00Z", banReason: "Menaces répétées", warnings: [], gamesPlayed: 40, role: null, permanentBan: true, chatMutedUntil: null, sanctions: [{ id: "s2", type: "permanent_ban", at: now, until: null, reason: "Menaces répétées", by: "Admin (admin)", revoked: false }] },
  { id: "u3", displayName: "Modo", email: "modo@example.org", createdAt: "2026-07-01T00:00:00Z", bannedUntil: null, banReason: null, warnings: [], gamesPlayed: 80, role: "moderator", permanentBan: false, chatMutedUntil: null, sanctions: [] },
];
// Tableau de bord : données inventées mais réalistes (une soirée à plusieurs tables, etc.).
const insights = {
  generatedAt: now,
  kpis: { accounts: 42, verifiedAccounts: 37, activeAccounts7d: 18, activeAccounts30d: 29, finishedGames: 164, abortedGames: 9, medianMinutes: 21.5, replayRate: 0.62, accountSeatShare: 0.41 },
  gamesPerDay: Array.from({ length: 30 }, (_, index) => {
    const day = new Date(Date.UTC(2026, 7, 30 + index)).toISOString().slice(0, 10);
    const weekend = [5, 6].includes(new Date(day).getUTCDay());
    return { day, finished: weekend ? 9 + (index % 5) : 2 + (index % 4), aborted: index % 6 === 0 ? 1 : 0 };
  }),
  byPlayerCount: [
    { players: 2, games: 21, medianMinutes: 3, naziWinRate: null },
    { players: 4, games: 12, medianMinutes: 14, naziWinRate: 0.42 },
    { players: 5, games: 38, medianMinutes: 18, naziWinRate: 0.47 },
    { players: 6, games: 30, medianMinutes: 22, naziWinRate: 0.53 },
    { players: 7, games: 24, medianMinutes: 24, naziWinRate: 0.5 },
    { players: 8, games: 19, medianMinutes: 27, naziWinRate: 0.58 },
    { players: 10, games: 13, medianMinutes: 31, naziWinRate: 0.46 },
    { players: 14, games: 7, medianMinutes: 38, naziWinRate: 0.57 },
  ],
  modes: [{ mode: "classic", games: 101 }, { mode: "quick", games: 38 }, { mode: "duel", games: 21 }, { mode: "custom", games: 4 }],
  replay: { replay: 512, quit: 97, none: 188, replayedGames: 102, finishedGames: 164 },
  signupsPerWeek: Array.from({ length: 12 }, (_, index) => ({ week: new Date(Date.UTC(2026, 6, 6 + index * 7)).toISOString().slice(0, 10), signups: [0, 0, 1, 0, 2, 1, 3, 2, 6, 9, 11, 7][index] as number })),
  retention: [
    { cohort: "2026-09-07", size: 9, weeks: [1, 0.67, 0.44, 0.33, null] },
    { cohort: "2026-09-14", size: 11, weeks: [1, 0.55, 0.36, null, null] },
    { cohort: "2026-09-21", size: 7, weeks: [0.86, 0.43, null, null, null] },
    { cohort: "2026-09-28", size: 3, weeks: [0.67, null, null, null, null] },
  ],
};

const banRequests = [{ id: "br1", caseId: "case_1", pseudonym: "Joueur A", reason: "Menaces répétées après un mute", requestedBy: "Modo (modérateur)", createdAt: now, status: "pending", decidedAt: null, decidedBy: null, case: caseEntry, target: { pseudo: "Karl", userId: "u1", displayName: "Karl", email: "karl@example.org" } }];
const stats = { users: { total: 128, verified: 117 }, games: { total: 412, finished: 380, aborted: 32, last24h: 23, last7d: 140, winsNazi: 170, winsCommunist: 210, forfeits: 18, openCases: 2, totalCases: 9 }, live: { rooms: 3, players: 26, connectedPlayers: 25, gamesInProgress: 2 }, unreadContact: 1 };

async function mock(page: Page, role: "admin" | "moderator"): Promise<void> {
  await page.route("**/api/me", (r) => r.fulfill({ json: { user: { id: "me", displayName: role === "admin" ? "Admin" : "Modo", createdAt: "2026-01-01", stats: { wins: 0, losses: 0 }, isAdmin: role === "admin", isModerator: role === "moderator" } } }));
  const session = { elevated: true, role, totpEnabled: true };
  await page.route("**/api/moderation/session", (r) => r.fulfill({ json: session }));
  await page.route("**/api/admin/session", (r) => r.fulfill({ json: session }));
  await page.route("**/api/moderation/cases?*", (r) => r.fulfill({ json: { cases: [caseEntry, { ...caseEntry, id: "case_2", trigger: { type: "report", reporter: "Joueur C", reason: "insultes répétées" } }] } }));
  await page.route("**/api/moderation/cases/case_1", (r) => r.fulfill({ json: { case: caseEntry, participants: [{ pseudonym: "Joueur A", kind: "account", priorSanctions: 1, restriction: "muted" }, { pseudonym: "Joueur B", kind: "account", priorSanctions: 0, restriction: null }, { pseudonym: "Joueur C", kind: "guest", priorSanctions: 0, restriction: null }], banRequests: [], audit: [{ action: "mute", at: now, detail: "Joueur A · 24 h · Menaces", actor: "Modo (modérateur)" }] } }));
  await page.route("**/api/admin/stats", (r) => r.fulfill({ json: stats }));
  await page.route("**/api/admin/insights", (r) => r.fulfill({ json: insights }));
  await page.route("**/api/admin/games**", (r) => r.fulfill({ json: { games } }));
  await page.route("**/api/admin/users**", (r) => r.fulfill({ json: { users } }));
  await page.route("**/api/admin/ban-requests**", (r) => r.fulfill({ json: { requests: banRequests } }));
}

for (const size of [{ name: "mobile", width: 375, height: 760 }, { name: "ordinateur", width: 1280, height: 860 }]) {
  test(`panels d'équipe — ${size.name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await mock(page, "moderator");
    await page.goto("/moderation");
    await page.getByText(/menaces · je sais/).first().waitFor();
    await page.screenshot({ path: `${OUT}/40-moderation-liste-${size.name}.png`, fullPage: true });
    await page.getByText(/menaces · je sais/).first().click();
    await page.getByText("Participants").waitFor();
    await page.screenshot({ path: `${OUT}/41-moderation-dossier-${size.name}.png`, fullPage: true });

    await page.unrouteAll();
    await mock(page, "admin");
    await page.goto("/admin");
    for (const [tab, file] of [["Statistiques", "42-admin-statistiques"], ["Graphiques", "42b-admin-graphiques"], ["Parties", "43-admin-parties"], ["Demandes de ban", "44-admin-demandes-ban"], ["Comptes", "45-admin-comptes"]] as const) {
      await page.locator(".admin-tabs button", { hasText: tab }).first().click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${file}-${size.name}.png`, fullPage: true });
      if (tab === "Graphiques") {
        // La page défile dans son calque : captures en descendant jusqu'en bas.
        for (let part = 2; part <= 4; part += 1) {
          await page.locator(".page-layer").evaluate((layer, step) => layer.scrollTo(0, step * layer.clientHeight * 0.9), part - 1);
          await page.waitForTimeout(200);
          await page.screenshot({ path: `${OUT}/${file}-${part}-${size.name}.png` });
        }
      }
    }
  });
}
