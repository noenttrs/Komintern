// Titre et description de chaque page publique : repris par l'application (onglet du navigateur)
// et par scripts/prerender.mjs (HTML servi aux moteurs de recherche avant le JavaScript).
import type { Route } from "./router";

export const SITE_URL = "https://fascismwontget.me";
export const SITE_NAME = "Nazi Communiste";

export type SeoPage = { path: string; title: string; description: string };

export const HOME_SEO: SeoPage = {
  path: "/",
  title: "Nazi Communiste · Jeu de bluff en ligne pour vos soirées, de 2 à 14 joueurs",
  description:
    "Le jeu de bluff parfait pour vos soirées : un jeu de rôles cachés gratuit, chacun sur son téléphone, de 2 à 14 joueurs, autour d'une table ou à distance. Sans inscription, sans publicité.",
};

export const PAGE_SEO = {
  rules: {
    path: "/regles",
    title: "Règles du jeu · Nazi Communiste",
    description:
      "Règles de Nazi Communiste : but du jeu, déroulement d'une manche (proposition, vote de confiance, mission), formats de 3 à 14 joueurs, partie rapide et duel à 2.",
  },
  about: {
    path: "/a-propos",
    title: "À propos · Nazi Communiste, jeu de déduction sociale",
    description:
      "Nazi Communiste est un jeu de déduction sociale satirique et antifasciste : des nazis infiltrés, des communistes qui doivent les démasquer, des votes publics et des missions secrètes.",
  },
  support: {
    path: "/soutenir",
    title: "Soutenir le projet · Nazi Communiste",
    description: "Nazi Communiste est gratuit, sans publicité et open source. Un don aide à payer le serveur et le nom de domaine.",
  },
  contact: {
    path: "/contact",
    title: "Contact · Nazi Communiste",
    description: "Une question, un bug, une idée ? Écrivez à l'équipe de Nazi Communiste.",
  },
  terms: {
    path: "/conditions-utilisation",
    title: "Conditions d'utilisation · Nazi Communiste",
    description: "Conditions d'utilisation de Nazi Communiste : âge minimum, règles de conduite, modération, sanctions et recours, signalement de contenus.",
  },
  legal: {
    path: "/mentions-legales",
    title: "Mentions légales et confidentialité · Nazi Communiste",
    description: "Éditeur, hébergement, données personnelles, cookies et droits des joueurs de Nazi Communiste.",
  },
} satisfies Partial<Record<Route["page"], SeoPage>>;

/** Titre de l'onglet pour une route (pages publiques ; les autres gardent le nom du jeu). */
export function seoFor(route: Route): SeoPage {
  return (PAGE_SEO as Partial<Record<Route["page"], SeoPage>>)[route.page] ?? HOME_SEO;
}
