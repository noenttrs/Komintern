import { useState } from "react";

import type { useInstallPrompt } from "../hooks/useInstallPrompt";
import { useI18n } from "../i18n";
import { availableStorage, finishedGamesCount } from "../supportBanner";
import { supportBannerShownThisVisit } from "./SupportBanner";

const STORAGE_KEY = "komintern.install_banner";
const HIDE_MS = 30 * 24 * 3600 * 1000;

/**
 * Invitation à installer l'app, sur l'accueil seulement, après une première partie terminée :
 * jamais en pleine partie, jamais en même temps que le bandeau de soutien. « Plus tard » : 30 jours.
 */
export function InstallBanner({ install }: { install: ReturnType<typeof useInstallPrompt> }): JSX.Element | null {
  const { t } = useI18n();
  const [storage] = useState(availableStorage);
  const [hidden, setHidden] = useState(() => {
    try {
      return Number(storage?.getItem(STORAGE_KEY) ?? 0) > Date.now();
    } catch {
      return true;
    }
  });
  const [showIosHelp, setShowIosHelp] = useState(false);
  if (storage === null || hidden || install.installed || (!install.canPrompt && !install.isIos) || finishedGamesCount(storage) < 1 || supportBannerShownThisVisit()) {
    return null;
  }
  const later = () => {
    try {
      storage.setItem(STORAGE_KEY, String(Date.now() + HIDE_MS));
    } catch {
      // Stockage plein ou bloqué : masqué pour cette visite seulement.
    }
    setHidden(true);
  };
  return (
    <aside className="support-banner install-banner" aria-label={t("installBanner.label")}>
      <p>{t("installBanner.text")}</p>
      {showIosHelp ? <p className="field-hint">{t("menu.iosHelp")}</p> : null}
      <div className="support-banner__actions">
        <button type="button" onClick={() => (install.canPrompt ? void install.install() : setShowIosHelp(true))}>
          {t("installBanner.install")}
        </button>
        <button type="button" className="secondary" onClick={later}>
          {t("installBanner.later")}
        </button>
      </div>
    </aside>
  );
}
