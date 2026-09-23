import { createContext, type Dispatch, type SetStateAction, useContext } from "react";

import type { useAccount } from "../hooks/useAccount";
import type { UseGameSocketResult } from "../hooks/useGameSocket";
import type { ConfidenceVote, MissionVote, RulesetPreset } from "../types";

type Setter<T> = Dispatch<SetStateAction<T>>;

export type RulesMode = "default" | "preset" | "custom";
export type InfoMode = "full" | "partial" | "blind";

/**
 * Tout ce dont les écrans ont besoin, construit une seule fois par App :
 * état et actions du jeu, compte, état d'interface local et valeurs dérivées.
 */
export type ScreenContextValue = UseGameSocketResult & {
  account: ReturnType<typeof useAccount>;
  inviteCode: string | null;

  // Brouillons des écrans de création / d'entrée dans une room (conservés dans App pour survivre aux allers-retours).
  joinCodeDraft: string;
  setJoinCodeDraft: Setter<string>;
  roomNameDraft: string;
  setRoomNameDraft: Setter<string>;
  remotePlay: boolean;
  setRemotePlay: Setter<boolean>;
  publicDraft: boolean;
  setPublicDraft: Setter<boolean>;
  rulesMode: RulesMode;
  setRulesMode: Setter<RulesMode>;
  presetDraft: RulesetPreset;
  setPresetDraft: Setter<RulesetPreset>;
  customPlayerCount: number;
  setCustomPlayerCount: Setter<number>;
  customNaziCount: number;
  setCustomNaziCount: Setter<number>;
  customCommunistCount: number;
  setCustomCommunistCount: Setter<number>;
  customMissionSizes: string;
  setCustomMissionSizes: Setter<string>;
  customMissionCount: number;
  setCustomMissionCount: Setter<number>;
  customWinThreshold: number;
  setCustomWinThreshold: Setter<number>;
  customInfoMode: InfoMode;
  setCustomInfoMode: Setter<InfoMode>;
  customExperimental: boolean;
  setCustomExperimental: Setter<boolean>;

  // État d'interface de la partie, remis à zéro par App à chaque changement de phase.
  selectedTeam: string[];
  setSelectedTeam: Setter<string[]>;
  tableOrderAdjustPosition: number;
  setTableOrderAdjustPosition: Setter<number>;
  showOrderAdjustInput: boolean;
  setShowOrderAdjustInput: Setter<boolean>;
  showFullHistory: boolean;
  waitingValidationStep: string | null;
  setWaitingValidationStep: Setter<string | null>;
  setQueuedReplayChoice: Setter<"replay" | null>;
  selectedConfidenceVote: ConfidenceVote | null;
  setSelectedConfidenceVote: Setter<ConfidenceVote | null>;
  selectedMissionVote: MissionVote | null;
  setSelectedMissionVote: Setter<MissionVote | null>;
  hasRevealedRoleOnce: boolean;
  setHasRevealedRoleOnce: Setter<boolean>;

  // Valeurs dérivées et fragments partagés entre écrans.
  isHost: boolean;
  canStart: boolean;
  flexibleRoom: boolean;
  nameById: (id: string) => string;
  naziAllies: string[];
  orderReference: string[];
  orderLegend: JSX.Element;
  myOrderIndex: number;
  allOrderChosen: boolean;
  roleOverlay: JSX.Element;
  defaultBackContent: JSX.Element;
  expandedBackContent: JSX.Element;
  frontMeta: JSX.Element;
  frontFooter: JSX.Element;
  missionProgressLabel: string;
};

const ScreenContext = createContext<ScreenContextValue | null>(null);

export const ScreenProvider = ScreenContext.Provider;

export function useScreen(): ScreenContextValue {
  const value = useContext(ScreenContext);
  if (value === null) {
    throw new Error("useScreen doit être utilisé sous <ScreenProvider>.");
  }
  return value;
}
