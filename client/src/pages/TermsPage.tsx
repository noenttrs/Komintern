import { PageShell } from "../components/PageShell";
import { type TranslationKey, useI18n } from "../i18n";

// Sections dans l'ordre : titre, puis paragraphes (ou liste pour les règles de conduite).
const SECTIONS: Array<[TranslationKey, TranslationKey[]]> = [
  ["terms.serviceTitle", ["terms.service"]],
  ["terms.ageTitle", ["terms.age"]],
  ["terms.accountTitle", ["terms.account"]],
  ["terms.moderationTitle", ["terms.moderation", "terms.reasons"]],
  ["terms.reportTitle", ["terms.report"]],
  ["terms.ipTitle", ["terms.ip"]],
  ["terms.liabilityTitle", ["terms.liability"]],
  ["terms.dataTitle", ["terms.data"]],
  ["terms.changesTitle", ["terms.changes"]],
  ["terms.lawTitle", ["terms.law"]],
];

const CONDUCT: TranslationKey[] = [
  "terms.conduct1",
  "terms.conduct2",
  "terms.conduct3",
  "terms.conduct4",
  "terms.conduct5",
  "terms.conduct6",
  "terms.conduct7",
  "terms.conduct8",
];

/** Conditions d'utilisation : règles de conduite, sanctions et recours (politique de modération). */
export function TermsPage(): JSX.Element {
  const { t, tr } = useI18n();
  const links = {
    legal: (chunk: string) => <a href="/mentions-legales">{chunk}</a>,
    contact: (chunk: string) => <a href="/contact">{chunk}</a>,
  };
  const section = ([title, paragraphs]: [TranslationKey, TranslationKey[]]) => (
    <section key={title}>
      <h2>{t(title)}</h2>
      {paragraphs.map((key) => <p key={key}>{tr(key, links)}</p>)}
    </section>
  );
  return (
    <PageShell title={t("terms.title")}>
      <article className="panel page-panel prose">
        <p className="mono">{t("terms.version")}</p>
        <p>{t("terms.intro")}</p>
        {SECTIONS.slice(0, 3).map(section)}
        <section>
          <h2>{t("terms.conductTitle")}</h2>
          <p>{t("terms.conductIntro")}</p>
          <ul>
            {CONDUCT.map((key) => <li key={key}>{t(key)}</li>)}
          </ul>
        </section>
        {SECTIONS.slice(3).map(section)}
      </article>
    </PageShell>
  );
}
