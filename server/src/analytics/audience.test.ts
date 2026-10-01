import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKv } from "../store/kv";
import { Audience, isBotAgent } from "./audience";

const HUMANS = {
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
};
// Robots qui exécutent le JavaScript (donc envoient des pages vues), aperçus de liens, clients HTTP.
const BOTS = {
  googlebot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/130.0.0.0 Safari/537.36",
  searchConsole: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)",
  lighthouse: "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
  bing: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/130.0.0.0 Safari/537.36",
  headless: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36",
  facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  whatsapp: "WhatsApp/2.23.20.0 A",
  gpt: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  python: "python-requests/2.31.0",
  curl: "curl/8.5.0",
  node: "node",
  empty: "",
};

test("robots, outils d'audit et clients HTTP reconnus ; navigateurs courants comptés", () => {
  for (const [name, agent] of Object.entries(BOTS)) assert.equal(isBotAgent(agent), true, name);
  for (const [name, agent] of Object.entries(HUMANS)) assert.equal(isBotAgent(agent), false, name);
});

test("un robot ou un automate est dénombré, sans compter de visiteur ni de page vue", async () => {
  const audience = new Audience(new MemoryKv());
  const now = new Date("2026-10-01T12:00:00Z");
  await audience.record("/", "198.51.100.7", HUMANS.chrome, now);
  await audience.record("/regles", "198.51.100.7", BOTS.searchConsole, now);
  await audience.record("/", "198.51.100.8", HUMANS.firefox, now, { automated: true });
  await audience.record("/nimporte-quoi", "198.51.100.9", BOTS.lighthouse, now); // chemin inconnu : ni compté, ni dénombré
  const today = (await audience.summary(1, now)).daily[0];
  assert.deepEqual(today, { day: "2026-10-01", visitors: 1, pageviews: 1, bots: 2 });
});
