import { useEffect, useState } from "react";

import { type TranslationKey, useI18n } from "../i18n";
import type { UIPhase } from "../types";

const STORAGE_KEY = "komintern.tips_seen";

const TIPS: Partial<Record<UIPhase, { title: TranslationKey; text: TranslationKey }>> = {
  table_order: { title: "tutorial.tableOrderTitle", text: "tutorial.tableOrderText" },
  role_reveal: { title: "tutorial.roleRevealTitle", text: "tutorial.roleRevealText" },
  mission_proposal: { title: "tutorial.proposalTitle", text: "tutorial.proposalText" },
  confidence_vote: { title: "tutorial.confidenceTitle", text: "tutorial.confidenceText" },
  mission_execution: { title: "tutorial.missionTitle", text: "tutorial.missionText" },
  mission_result: { title: "tutorial.resultTitle", text: "tutorial.resultText" },
};

function readSeen(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Tutoriel de première partie : une astuce par écran de jeu, affichée une seule fois. */
export function Tutorial({ phase }: { phase: UIPhase }): JSX.Element | null {
  const { t } = useI18n();
  const [seen, setSeen] = useState<string[]>(readSeen);
  const tip = TIPS[phase];
  const visible = tip !== undefined && !seen.includes(phase) && !seen.includes("*");

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
    } catch {
      // Stockage indisponible : les astuces réapparaîtront, sans gravité.
    }
  }, [seen]);

  if (!visible || tip === undefined) {
    return null;
  }
  return (
    <div className="tip-overlay" role="dialog" aria-modal="true" aria-labelledby="tip-title" onClick={(event) => event.stopPropagation()}>
      <div className="tip-card">
        <p className="mono">{t("tutorial.tip")}</p>
        <h2 id="tip-title">{t(tip.title)}</h2>
        <p>{t(tip.text)}</p>
        <button type="button" onClick={() => setSeen((current) => [...current, phase])}>{t("tutorial.gotIt")}</button>
        <button type="button" className="link-button" onClick={() => setSeen((current) => [...current, "*"])}>{t("tutorial.noMore")}</button>
      </div>
    </div>
  );
}
