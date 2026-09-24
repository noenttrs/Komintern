// Rendu HTML des pages publiques au moment du build (scripts/prerender.mjs) : les moteurs de
// recherche lisent le vrai contenu de chaque page sans exécuter le JavaScript. Dans le navigateur,
// React remplace ce HTML au chargement (createRoot, pas d'hydratation).
import { renderToStaticMarkup } from "react-dom/server";

import { setLang } from "./i18n";
import { AboutPage } from "./pages/AboutPage";
import { ContactPage } from "./pages/ContactPage";
import { LegalPage } from "./pages/LegalPage";
import { RulesPage } from "./pages/RulesPage";
import { SupportPage } from "./pages/SupportPage";
import { PAGE_SEO } from "./seo";

export { HOME_SEO, PAGE_SEO, SITE_NAME, SITE_URL } from "./seo";

export type PrerenderConfig = { editorName: string; contactEmail: string; donationUrl: string };

export function renderPages(config: PrerenderConfig): Array<{ key: keyof typeof PAGE_SEO; html: string }> {
  setLang("fr");
  const pages: Record<keyof typeof PAGE_SEO, JSX.Element> = {
    rules: <RulesPage playerCount={null} />,
    about: <AboutPage />,
    support: <SupportPage donationUrl={config.donationUrl} />,
    contact: <ContactPage defaultEmail="" contactEmail={config.contactEmail} />,
    legal: <LegalPage editorName={config.editorName} contactEmail={config.contactEmail} />,
  };
  return (Object.keys(pages) as Array<keyof typeof PAGE_SEO>).map((key) => ({ key, html: renderToStaticMarkup(pages[key]) }));
}
