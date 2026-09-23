import fs from "fs";

export type WordList = { words: Set<string>; phrases: string[][] };

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
  const words = new Set<string>();
  const phrases: string[][] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const tokens = line.split(/\s+/).map(normalizeToken);
    if (tokens.length === 1) {
      words.add(tokens[0] as string);
    } else {
      phrases.push(tokens);
    }
  }
  return { words, phrases };
}

export function loadWordList(path: string): WordList {
  try {
    return parseWordList(fs.readFileSync(path, "utf8"));
  } catch {
    return { words: new Set(), phrases: [] };
  }
}

export type FilterResult = { masked: string; flagged: string[] };

/** Masque les mots signalés (***) et renvoie ceux trouvés. */
export function filterMessage(text: string, list: WordList): FilterResult {
  const tokens = [...text.matchAll(/[\p{L}\p{N}@$]+/gu)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    forms: variants(normalizeToken(match[0])),
  }));
  const hits = new Set<number>();
  const flagged: string[] = [];

  tokens.forEach((token, index) => {
    const match = token.forms.find((form) => list.words.has(form));
    if (match !== undefined) {
      hits.add(index);
      flagged.push(match);
    }
  });
  for (const phrase of list.phrases) {
    for (let index = 0; index + phrase.length <= tokens.length; index += 1) {
      if (phrase.every((word, offset) => tokens[index + offset]?.forms.includes(word) === true)) {
        phrase.forEach((_, offset) => hits.add(index + offset));
        flagged.push(phrase.join(" "));
      }
    }
  }

  if (hits.size === 0) {
    return { masked: text, flagged: [] };
  }
  let masked = "";
  let cursor = 0;
  tokens.forEach((token, index) => {
    if (hits.has(index)) {
      masked += text.slice(cursor, token.start) + "*".repeat(token.end - token.start);
      cursor = token.end;
    }
  });
  return { masked: masked + text.slice(cursor), flagged: [...new Set(flagged)] };
}
