import { PageShell } from "../components/PageShell";
import { useI18n } from "../i18n";

export function AboutPage(): JSX.Element {
  const { t, tr } = useI18n();
  return (
    <PageShell title={t("about.title")}>
      <article className="panel page-panel prose">
        <p>{tr("about.intro")}</p>
        <h2>{t("about.campsTitle")}</h2>
        <ul>
          <li>{tr("about.nazis")}</li>
          <li>{tr("about.communists")}</li>
        </ul>
        <h2>{t("about.roundTitle")}</h2>
        <ol>
          <li>{tr("about.proposal")}</li>
          <li>{tr("about.confidence")}</li>
          <li>{tr("about.mission")}</li>
        </ol>
        <p>{t("about.win")}</p>
        <h2>{t("about.playersTitle")}</h2>
        <p>{t("about.players")}</p>
        <h2>{t("about.accountTitle")}</h2>
        <p>{t("about.account")}</p>
        <p>
          {tr("about.support", {
            support: (chunk) => <a href="/soutenir">{chunk}</a>,
            contact: (chunk) => <a href="/contact">{chunk}</a>,
          })}
        </p>
        <p className="mono">
          {t("about.agents")} <a href="/llms.txt">/llms.txt</a> · <a href="/agents.html">/agents.html</a>
        </p>
      </article>
    </PageShell>
  );
}
