// Après `vite build` : une page HTML par page publique (dist/regles/index.html…), avec son titre,
// sa description, son adresse canonique et son contenu rendu par React, plus dist/404.html et
// dist/sitemap.xml. nginx sert ces fichiers (nginx.conf) ; le JavaScript prend ensuite le relais.
// Usage : node scripts/prerender.mjs (lancé par `npm run build`).
import fs from "node:fs";
import path from "node:path";

import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let mod;
try {
  mod = await vite.ssrLoadModule("/src/prerender.tsx");
} finally {
  await vite.close();
}
const { renderPages, HOME_SEO, PAGE_SEO, SITE_NAME, SITE_URL } = mod;

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const shell = fs.readFileSync("dist/index.html", "utf8");

/** Remplace une chaîne attendue ; échoue si le gabarit a changé (plutôt qu'une page fausse). */
function swap(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`prerender: motif introuvable ${pattern}`);
  return html.replace(pattern, replacement);
}

function withHead(html, seo) {
  const url = `${SITE_URL}${seo.path}`;
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${escape(seo.title)}</title>`);
  html = swap(html, /(<meta name="description" content=")[^"]*"/, `$1${escape(seo.description)}"`);
  html = swap(html, /(<link rel="canonical" href=")[^"]*"/, `$1${url}"`);
  html = swap(html, /(<meta property="og:url" content=")[^"]*"/, `$1${url}"`);
  html = swap(html, /(<meta property="og:title" content=")[^"]*"/, `$1${escape(seo.title)}"`);
  html = swap(html, /(<meta property="og:description" content=")[^"]*"/, `$1${escape(seo.description)}"`);
  // Données structurées du jeu et de la FAQ : page d'accueil seulement.
  return swap(html, /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, "");
}

const withBody = (html, body) => swap(html, /<!-- static:start -->[\s\S]*?<!-- static:end -->/, `<!-- static:start -->\n${body}\n      <!-- static:end -->`);

const nav = `<nav class="static-nav" aria-label="Pages">${[
  ["/", "Jouer"],
  ...Object.values(PAGE_SEO).map((page) => [page.path, page.title.split(" · ")[0]]),
]
  .map(([href, label]) => `<a href="${href}">${escape(label)}</a>`)
  .join(" · ")}</nav>`;

const config = {
  editorName: process.env.LEGAL_EDITOR_NAME ?? "",
  contactEmail: process.env.LEGAL_CONTACT_EMAIL ?? "",
  donationUrl: /^https:\/\/[^\s"<>]+$/.test(process.env.DONATION_URL ?? "") ? process.env.DONATION_URL : "",
};

const written = [];
for (const { key, html } of renderPages(config)) {
  const seo = PAGE_SEO[key];
  // PageShell se termine par trois </div> (corps, page, calque) : la navigation va dans le corps.
  const body = swap(html, /<\/div><\/div><\/div>$/, `${nav}</div></div></div>`);
  const file = path.join("dist", seo.path.slice(1), "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, withBody(withHead(shell, seo), body));
  written.push(file);
}

// Page 404 : statique (sans le JavaScript de l'application), jamais indexée.
let notFound = withHead(shell, { path: "/", title: `Page introuvable · ${SITE_NAME}`, description: HOME_SEO.description });
notFound = swap(notFound, /\s*<link rel="canonical"[^>]*>/, '\n    <meta name="robots" content="noindex" />');
notFound = notFound.replace(/\s*<script type="module"[^>]*><\/script>/g, "").replace(/\s*<link rel="modulepreload"[^>]*>/g, "");
notFound = withBody(
  notFound,
  `      <article class="static-page"><h1>Page introuvable</h1><p>Cette adresse n'existe pas (ou plus). Une invitation à une partie ressemble à <code>/r/CODE</code>.</p><p><a href="/">Retour au jeu</a></p>${nav}</article>`,
);
fs.writeFileSync("dist/404.html", notFound);
written.push("dist/404.html");

const urls = [HOME_SEO, ...Object.values(PAGE_SEO)].map((page) => `  <url><loc>${SITE_URL}${page.path}</loc></url>`);
fs.writeFileSync(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
);
written.push("dist/sitemap.xml");
console.log(`prerender: ${written.join(", ")}`);
