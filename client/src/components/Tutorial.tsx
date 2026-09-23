import { useEffect, useState } from "react";

import type { UIPhase } from "../types";

const STORAGE_KEY = "komintern.tips_seen";

const TIPS: Partial<Record<UIPhase, { title: string; text: string }>> = {
  table_order: { title: "Ordre de table", text: "Touchez l'écran chacun votre tour, dans l'ordre où vous êtes assis autour de la table." },
  role_reveal: { title: "Votre rôle", text: "Maintenez la carte appuyée pour voir votre rôle sans que vos voisins le voient, puis validez." },
  mission_proposal: { title: "Proposition", text: "Le chef choisit les joueurs à envoyer en mission. Les autres attendent et observent." },
  confidence_vote: { title: "Vote de confiance", text: "Tout le monde vote pour ou contre cette équipe. Les votes seront visibles de tous." },
  mission_execution: { title: "Mission", text: "Seuls les membres de l'équipe votent, en secret. Un seul vote nazi fait échouer la mission." },
  mission_result: { title: "Résultat", text: "Le nombre de votes nazis est révélé, sans dire qui a voté quoi. À vous de déduire !" },
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
        <p className="mono">Astuce</p>
        <h2 id="tip-title">{tip.title}</h2>
        <p>{tip.text}</p>
        <button type="button" onClick={() => setSeen((current) => [...current, phase])}>Compris</button>
        <button type="button" className="link-button" onClick={() => setSeen((current) => [...current, "*"])}>Ne plus afficher d'astuces</button>
      </div>
    </div>
  );
}
