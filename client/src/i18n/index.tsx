// Traductions sans dépendance : français (langue de référence) et anglais.
import { Fragment, type ReactNode, useEffect, useSyncExternalStore } from "react";

import { en } from "./en";
import { fr } from "./fr";

export type Lang = "fr" | "en";

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Toutes les clés de traduction, en notation pointée (ex. « lobby.start »). */
export type TranslationKey = Leaves<typeof fr>;

/** Clés plurielles : `x_one` / `x_other` → « x ». */
export type PluralKey = TranslationKey extends infer K ? (K extends `${infer B}_one` ? B : never) : never;

export type Vars = Record<string, string | number>;

const STORAGE_KEY = "komintern.lang";
const DICTIONARIES: Record<Lang, unknown> = { fr, en };

/**
 * Langue initiale : choix enregistré, sinon français, sauf si le navigateur
 * ne déclare aucune variante du français (on passe alors en anglais).
 */
export function detectLanguage(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "fr" || stored === "en") return stored;
  } catch {
    // Stockage indisponible : on se fie au navigateur.
  }
  try {
    const languages = navigator.languages !== undefined && navigator.languages.length > 0 ? navigator.languages : [navigator.language];
    const known = languages.filter((entry): entry is string => typeof entry === "string" && entry !== "");
    if (known.length > 0 && !known.some((entry) => entry.toLowerCase().startsWith("fr"))) return "en";
  } catch {
    // Navigateur exotique : français par défaut.
  }
  return "fr";
}

let current: Lang = typeof window === "undefined" ? "fr" : detectLanguage();
const listeners = new Set<() => void>();

function syncDocument(): void {
  if (typeof document !== "undefined") document.documentElement.lang = current;
}

export function getLang(): Lang {
  return current;
}

/** Change la langue (et la mémorise) ; utilisable hors composant. */
export function setLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Stockage indisponible : choix valable pour cette visite seulement.
  }
  if (lang === current) return;
  current = lang;
  syncDocument();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function lookup(lang: Lang, key: string): string {
  let node: unknown = DICTIONARIES[lang];
  for (const part of key.split(".")) {
    node = typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }
  if (typeof node === "string") return node;
  return lang === "fr" ? key : lookup("fr", key);
}

function interpolate(text: string, vars?: Vars): string {
  if (vars === undefined) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Traduction dans la langue courante, pour les modules hors React (erreurs, notices…). */
export function translate(key: TranslationKey, vars?: Vars, lang: Lang = current): string {
  return interpolate(lookup(lang, key), vars);
}

/** Pluriel : `key_one` si count vaut 1 (ou 0 en français), sinon `key_other`. `{count}` est fourni. */
export function translatePlural(key: PluralKey, count: number, vars?: Vars, lang: Lang = current): string {
  const one = lang === "fr" ? Math.abs(count) < 2 : count === 1;
  return translate(`${key}_${one ? "one" : "other"}` as TranslationKey, { count, ...vars }, lang);
}

type RichPart = string | number | ReactNode | ((chunk: string) => ReactNode);

/**
 * Texte enrichi : `<b>…</b>` devient <strong>, `<tag>…</tag>` appelle parts[tag](contenu),
 * `{name}` insère parts[name] (texte ou élément). Pas d'imbrication de balises.
 */
export function translateRich(key: TranslationKey, parts: Record<string, RichPart> = {}, lang: Lang = current): ReactNode {
  const textVars: Vars = {};
  for (const [name, value] of Object.entries(parts)) {
    if (typeof value === "string" || typeof value === "number") textVars[name] = value;
  }
  const text = interpolate(lookup(lang, key), textVars);
  const nodes: ReactNode[] = [];
  const pattern = /<(\w+)>([\s\S]*?)<\/\1>|\{(\w+)\}/g;
  let last = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [whole, tag, inner, name] = match;
    if (tag !== undefined) {
      const render = parts[tag];
      nodes.push(typeof render === "function" ? render(inner ?? "") : tag === "b" ? <strong>{inner}</strong> : inner);
    } else if (name !== undefined) {
      nodes.push(name in parts ? (parts[name] as ReactNode) : whole);
    }
    last = match.index + whole.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}

export type I18n = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
  tp: (key: PluralKey, count: number, vars?: Vars) => string;
  tr: (key: TranslationKey, parts?: Record<string, RichPart>) => ReactNode;
  /** Locale pour toLocaleDateString / toLocaleString. */
  locale: string;
};

/** Langue courante et fonctions de traduction ; fonctionne aussi hors <LanguageProvider>. */
export function useI18n(): I18n {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  return {
    lang,
    setLang,
    t: (key, vars) => translate(key, vars, lang),
    tp: (key, count, vars) => translatePlural(key, count, vars, lang),
    tr: (key, parts) => translateRich(key, parts, lang),
    locale: lang === "fr" ? "fr-FR" : "en-GB",
  };
}

/** Tient `<html lang>` à jour ; l'état de la langue vit dans ce module. */
export function LanguageProvider({ children }: { children: ReactNode }): JSX.Element {
  const { lang } = useI18n();
  useEffect(() => {
    syncDocument();
  }, [lang]);
  return <>{children}</>;
}
