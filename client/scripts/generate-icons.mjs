// Génère les icônes PNG de la web app depuis le motif du favicon (moustache communiste).
// Usage : node scripts/generate-icons.mjs
import sharp from "sharp";

const glyph =
  '<path fill="#0f0f0f" d="M21 12c-2 0-3-3-6-3s-3 2-3 2s0-2-3-2s-4 3-6 3c-1 0-2-1-2-1s1 5 5 5c5 0 6-3 6-3s1 3 6 3c4 0 5-5 5-5s-1 1-2 1"/>';

// padding : part de l'icône laissée vide autour du motif (les icônes « maskable » sont rognées en cercle).
function svg(padding) {
  const size = 24 / (1 - 2 * padding);
  const offset = (size - 24) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-offset} ${-offset} ${size} ${size}"><rect x="${-offset}" y="${-offset}" width="${size}" height="${size}" fill="#ffffff"/>${glyph}</svg>`,
  );
}

const targets = [
  ["public/icons/icon-192.png", 192, 0.12],
  ["public/icons/icon-512.png", 512, 0.12],
  ["public/icons/maskable-512.png", 512, 0.24],
  ["public/icons/apple-touch-icon.png", 180, 0.16],
];

for (const [file, size, padding] of targets) {
  await sharp(svg(padding)).resize(size, size).png().toFile(file);
  console.log(file);
}
