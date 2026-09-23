import { PageShell } from "../components/PageShell";
import { useI18n } from "../i18n";

export function SupportPage({ donationUrl }: { donationUrl: string }): JSX.Element {
  const { t, tr } = useI18n();
  return (
    <PageShell title={t("support.title")}>
      <article className="panel page-panel prose">
        <p>{tr("support.intro")}</p>
        <p>{t("support.helps")}</p>
        <ul>
          <li>{t("support.help1")}</li>
          <li>{t("support.help2")}</li>
          <li>{t("support.help3")}</li>
        </ul>
        {donationUrl !== "" ? (
          <a className="button-link button-link--primary" href={donationUrl} target="_blank" rel="noopener noreferrer">
            {t("support.donate")}
          </a>
        ) : (
          <p className="form-message">{t("support.soon")}</p>
        )}
        <p className="mono">{t("support.payment")}</p>
        <p>{t("support.spread")}</p>
      </article>
    </PageShell>
  );
}
