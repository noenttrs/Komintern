import { useState } from "react";

import { audienceOptedOut, setAudienceOptOut } from "../audience";
import { PageShell } from "../components/PageShell";
import { useI18n } from "../i18n";

type LegalPageProps = { editorName: string; contactEmail: string };

export function LegalPage({ editorName, contactEmail }: LegalPageProps): JSX.Element {
  const { t, tr } = useI18n();
  const [optOut, setOptOut] = useState(audienceOptedOut);
  const missing = editorName === "" || contactEmail === "";
  const editor = editorName === "" ? t("legal.editorPlaceholder") : editorName;
  const contact = contactEmail === "" ? t("legal.contactPlaceholder") : contactEmail;
  const mail = contactEmail === "" ? contact : <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;
  const notice = t("legal.translationNotice");

  return (
    <PageShell title={t("legal.title")}>
      <article className="panel page-panel prose">
        {notice !== "" ? <p className="form-message">{notice}</p> : null}
        {missing ? <p className="form-message form-message--error">{t("legal.missing")}</p> : null}

        <h2>{t("legal.editorTitle")}</h2>
        <p>{tr("legal.editor", { editor, mail })}</p>

        <h2>{t("legal.hostingTitle")}</h2>
        <p>{t("legal.hosting")}</p>
        <p>{tr("legal.traffic")}</p>

        <h2>{t("legal.dataTitle")}</h2>
        <p>{tr("legal.controller", { mail })}</p>
        <h3>{t("legal.guestTitle")}</h3>
        <p>{t("legal.guest")}</p>
        <h3>{t("legal.accountTitle")}</h3>
        <ul>
          <li>{tr("legal.accountData")}</li>
          <li>{tr("legal.accountStats")}</li>
        </ul>
        <p>{t("legal.accountBasis")}</p>
        <h3>{t("legal.logTitle")}</h3>
        <p>{tr("legal.log")}</p>
        <p>{tr("legal.moderation")}</p>
        <h3>{t("legal.contactTitle")}</h3>
        <p>{tr("legal.contact")}</p>
        <h3>{t("legal.audienceTitle")}</h3>
        <p>{t("legal.audience")}</p>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={optOut}
            onChange={(event) => {
              setAudienceOptOut(event.target.checked);
              setOptOut(event.target.checked);
            }}
          />
          {t("legal.optOut")}
        </label>
        <h3>{t("legal.cookiesTitle")}</h3>
        <p>{t("legal.cookies")}</p>
        <h3>{t("legal.rightsTitle")}</h3>
        <p>{tr("legal.rights", { mail })}</p>

        <h2>{t("legal.ipTitle")}</h2>
        <p>{t("legal.ip")}</p>
      </article>
    </PageShell>
  );
}
