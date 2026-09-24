// Génère public/agents.html (version HTML lisible sans JavaScript) et le contenu statique de
// index.html (affiché avant le chargement de React, et lu par les agents IA) à partir de
// public/llms.txt, pour que les trois restent identiques.
// Usage : node scripts/generate-agents.mjs
import fs from "node:fs";

const source = fs.readFileSync("public/llms.txt", "utf8");
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (text) =>
  escape(text).replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>').replace(/(^|[\s(])(https:\/\/[^\s)<]*[^\s)<.,;:])/g, '$1<a href="$2">$2</a>');

function render(markdown) {
  const lines = markdown.split("\n");
  const out = [];
  let list = null;
  let table = null;
  const flush = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.tag}>`); list = null; }
    if (table) {
      const [head, , ...rows] = table;
      const cells = (row) => row.split("|").slice(1, -1).map((cell) => cell.trim());
      out.push(`<div class="table"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${cells(row).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      table = null;
    }
  };
  for (const line of lines) {
    if (line.startsWith("|")) { if (list) flush(); (table ??= []).push(line); continue; }
    if (table) flush();
    let match;
    if ((match = /^(#{1,3}) (.*)$/.exec(line))) { flush(); out.push(`<h${match[1].length}>${inline(match[2])}</h${match[1].length}>`); }
    else if ((match = /^> (.*)$/.exec(line))) { flush(); out.push(`<p class="lead">${inline(match[1])}</p>`); }
    else if ((match = /^- (.*)$/.exec(line))) { if (list?.tag !== "ul") { flush(); list = { tag: "ul", items: [] }; } list.items.push(match[1]); }
    else if ((match = /^\d+\. (.*)$/.exec(line))) { if (list?.tag !== "ol") { flush(); list = { tag: "ol", items: [] }; } list.items.push(match[1]); }
    else if (line.trim() === "") flush();
    else { flush(); out.push(`<p>${inline(line)}</p>`); }
  }
  flush();
  return out.join("\n");
}

const body = render(source);
fs.writeFileSync(
  "public/agents.html",
  `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nazi Communiste — le jeu de bluff parfait pour vos soirées</title>
    <meta name="description" content="Description complète de Nazi Communiste, jeu de bluff et de déduction sociale de 2 à 14 joueurs : règles, formats, duel, fonctionnalités, questions fréquentes. Version lisible sans JavaScript, pour les agents IA et les moteurs de recherche." />
    <link rel="stylesheet" href="/agents.css" />
    <link rel="alternate" type="text/markdown" href="/llms.txt" />
    <link rel="canonical" href="https://fascismwontget.me/" />
  </head>
  <body>
    <main>
${body}
    </main>
  </body>
</html>
`,
);

// Contenu statique de la page d'accueil : dans #root, remplacé par React dès que le JavaScript se charge.
const index = fs.readFileSync("index.html", "utf8");
const start = "<!-- static:start -->";
const end = "<!-- static:end -->";
const block = `${start}
      <article class="static-page">
<noscript><p class="static-note">JavaScript est désactivé : le jeu ne peut pas se lancer, mais voici sa description complète.</p></noscript>
${body}
      </article>
      ${end}`;
const next = index.includes(start)
  ? index.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block)
  : index.replace('<div id="root"></div>', `<div id="root">\n      ${block}\n    </div>`);
fs.writeFileSync("index.html", next);
console.log("public/agents.html, index.html");
