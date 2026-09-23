// Image d'aperçu des liens (Open Graph, 1200×630), dans la DA monochrome du site.
// Usage : node scripts/generate-og.mjs
import sharp from "sharp";

const mustache =
  '<path fill="#0f0f0f" d="M21 12c-2 0-3-3-6-3s-3 2-3 2s0-2-3-2s-4 3-6 3c-1 0-2-1-2-1s1 5 5 5c5 0 6-3 6-3s1 3 6 3c4 0 5-5 5-5s-1 1-2 1"/>';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="40" y="40" width="1120" height="550" fill="none" stroke="#111111" stroke-width="3"/>
  <g transform="translate(90 120) scale(9)">${mustache}</g>
  <text x="90" y="400" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="92" fill="#0f0f0f">Nazi Communiste</text>
  <text x="92" y="470" font-family="DejaVu Sans, Arial, sans-serif" font-size="36" fill="#535353">Jeu de déduction sociale · 4 à 11 joueurs</text>
  <text x="92" y="530" font-family="DejaVu Sans Mono, monospace" font-size="28" letter-spacing="4" fill="#0f0f0f">FASCISMWONTGET.ME</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile("public/og.png");
console.log("public/og.png");
