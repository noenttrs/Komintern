import fs from "fs";

/** Termes signalés, rangés par catégorie (lignes « @catégorie » du fichier). */
export type WordList = { words: Map<string, string>; phrases: Array<{ tokens: string[]; category: string }> };

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

/** Minuscules, sans accents, leetspeak simple. */
export function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[013457@$]/g, (char) => LEET[char] ?? char);
}

/** Variantes d'un mot aux lettres étirées (« connnnard », « saloooope ») : doublées ou simples. */
function variants(norm: string): string[] {
  return [norm, norm.replace(/(.)\1{2,}/g, "$1$1"), norm.replace(/(.)\1+/g, "$1")];
}

export function parseWordList(content: string): WordList {
  const words = new Map<string, string>();
  const phrases: WordList["phrases"] = [];
  let category = "autre";
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("@")) {
      category = line.slice(1).trim() || "autre";
      continue;
    }
    const tokens = line.split(/\s+/).map(normalizeToken);
    if (tokens.length === 1) {
      words.set(tokens[0] as string, category);
    } else {
      phrases.push({ tokens, category });
    }
  }
  return { words, phrases };
}

export function loadWordList(path: string): WordList {
  try {
    return parseWordList(fs.readFileSync(path, "utf8"));
  } catch {
    return { words: new Map(), phrases: [] };
  }
}

export type FlaggedTerm = { term: string; category: string };

// Coordonnées personnelles (doxxing) : numéros de téléphone français et adresses email.
const PHONE = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/u;

/**
 * Repère les termes signalés sans rien modifier : pas de censure, le message reste tel quel.
 * Le résultat sert uniquement à ouvrir un dossier que des modérateurs vérifient à la main.
 */
export function scanMessage(text: string, list: WordList): FlaggedTerm[] {
  const tokens = [...text.matchAll(/[\p{L}\p{N}@$]+/gu)].map((match) => variants(normalizeToken(match[0])));
  const found = new Map<string, string>();

  for (const forms of tokens) {
    const match = forms.find((form) => list.words.has(form));
    if (match !== undefined) found.set(match, list.words.get(match) as string);
  }
  for (const phrase of list.phrases) {
    for (let index = 0; index + phrase.tokens.length <= tokens.length; index += 1) {
      if (phrase.tokens.every((word, offset) => tokens[index + offset]?.includes(word) === true)) {
        found.set(phrase.tokens.join(" "), phrase.category);
      }
    }
  }
  if (PHONE.test(text)) found.set("numéro de téléphone", "donnees-personnelles");
  if (EMAIL.test(text)) found.set("adresse email", "donnees-personnelles");
  return [...found].map(([term, category]) => ({ term, category }));
}
