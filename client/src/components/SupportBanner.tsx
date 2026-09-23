import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import { useRoute } from "../router";
import { type DismissReason, KOFI_URL, availableStorage, dismissBanner, markBannerShown, shouldShowBanner } from "../supportBanner";
import type { UIPhase } from "../types";

// Une apparition par visite au plus : la bannière reste visible entre l'accueil et le salon
// sans ouvrir une nouvelle période de 7 jours. Un rechargement démarre une nouvelle visite.
let shownThisVisit = false;
let dismissedThisVisit = false;

/** Réservé aux tests. */
export function resetSupportBannerVisit(): void {
  shownThisVisit = false;
  dismissedThisVisit = false;
}

/** Bandeau de soutien Ko-fi, dans le flux de la carte : il ne recouvre jamais un contrôle. */
export function SupportBanner({ phase }: { phase: UIPhase }): JSX.Element | null {
  const { t } = useI18n();
  const route = useRoute();
  const [storage] = useState(availableStorage);
  const [dismissed, setDismissed] = useState(dismissedThisVisit);
  const visible =
    !dismissed && shouldShowBanner({ storage, phase, onGameScreen: route.page === "game", now: Date.now(), shownThisVisit });

  useEffect(() => {
    if (visible && !shownThisVisit) {
      shownThisVisit = true;
      markBannerShown(storage, Date.now());
    }
  }, [visible, storage]);

  if (!visible) return null;

  const dismiss = (reason: DismissReason) => {
    dismissBanner(storage, reason, Date.now());
    dismissedThisVisit = true;
    setDismissed(true);
  };

  return (
    <aside className="support-banner" aria-label={t("supportBanner.label")}>
      <p>{t("supportBanner.text")}</p>
      <div className="support-banner__actions">
        <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" onClick={() => dismiss("kofi")}>
          {t("supportBanner.kofi")}
        </a>
        <button type="button" className="secondary" onClick={() => dismiss("donated")}>
          {t("supportBanner.donated")}
        </button>
      </div>
      <button type="button" className="support-banner__close" aria-label={t("supportBanner.close")} onClick={() => dismiss("close")}>
        ×
      </button>
    </aside>
  );
}
