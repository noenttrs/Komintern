import { useState } from "react";

import { CardSurface } from "../components/game/CardSurface";
import { FactionIcon } from "../components/game/FactionIcon";
import { WaitingCard } from "../components/game/WaitingCard";
import { type TranslationKey, useI18n } from "../i18n";
import type { DuelResult } from "../types";
import { useScreen } from "./ScreenContext";

// Duel à 2 joueurs : vote secret « confiance » ou « nazi ! », puis résultat.

/** En-tête de carte du duel (pas de score de missions). */
export function DuelHeader(): JSX.Element {
  const { t } = useI18n();
  return <span className="score-chip">{t("duel.title")}</span>;
}

/** Dos de carte : la table des résultats, consultable pendant la discussion. */
export function DuelRulesPanel(): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="back-panel">
      <header className="back-panel__header">
        <h2>{t("duel.rulesTitle")}</h2>
        <p>{t("duel.rulesIntro")}</p>
      </header>
      <ul className="back-list">
        <li>{t("duel.rulesCommunists")}</li>
        <li>{t("duel.rulesMixed")}</li>
        <li>{t("duel.rulesNazis")}</li>
      </ul>
    </div>
  );
}

export function DuelVoteScreen(): JSX.Element {
  const { myId, players, duel, roleOverlay, sendDuelVote } = useScreen();
  const { t } = useI18n();
  const other = players.find((player) => player.id !== myId);
  const otherName = other?.pseudo ?? "?";
  const iVoted = duel.myVote !== null || (myId !== null && duel.votedPlayerIds.includes(myId));
  const otherVoted = other !== undefined && duel.votedPlayerIds.includes(other.id);
  const [swapped] = useState(() => Math.random() < 0.5);

  return (
    <main className="game-screen">
      <CardSurface
        scoreLeft={<DuelHeader />}
        scoreRight={<span className="score-chip">{t("duel.players")}</span>}
        meta={<div><p>{t("duel.against", { name: otherName })}</p></div>}
        footer={<div><p>{otherVoted ? t("duel.otherVoted", { name: otherName }) : t("duel.discuss")}</p></div>}
        front={
          iVoted ? (
            <WaitingCard message={t("duel.waitingOther", { name: otherName })} />
          ) : (
            <div className="vote-phase">
              <h2>{t("duel.question", { name: otherName })}</h2>
              <p>{t("duel.hint")}</p>
              {/* Ordre tiré au hasard : la position du doigt ne trahit pas le vote. */}
              <div className="vote-stack vote-stack--split">
                {(swapped ? (["accuse", "trust"] as const) : (["trust", "accuse"] as const)).map((vote) => (
                  <button key={vote} type="button" className="vote-btn" onClick={() => sendDuelVote(vote)}>
                    {vote === "trust" ? t("duel.trust") : t("duel.accuse")}
                  </button>
                ))}
              </div>
            </div>
          )
        }
        back={<DuelRulesPanel />}
        overlay={roleOverlay}
      />
    </main>
  );
}

/** Phrase qui explique le résultat, avec les noms des joueurs. */
export function duelExplanation(result: DuelResult, nameById: (id: string) => string, t: (key: TranslationKey, vars?: Record<string, string>) => string): string {
  const ids = Object.keys(result.roleMap);
  const nazi = ids.find((id) => result.roleMap[id] === "nazi");
  const communist = ids.find((id) => result.roleMap[id] === "communist");
  const accuser = ids.find((id) => result.votes[id] === "accuse");
  const vars = {
    nazi: nazi === undefined ? "?" : nameById(nazi),
    communist: communist === undefined ? "?" : nameById(communist),
    accuser: accuser === undefined ? "?" : nameById(accuser),
    name: result.forfeitedBy === null ? "?" : nameById(result.forfeitedBy),
  };
  const known = ["mutual_trust", "false_accusation", "mutual_accusation", "nazi_unmasked", "nazi_gave_himself_away", "nazi_accepted", "nazis_found_each_other", "nazi_found", "nazis_trusted_each_other", "forfeit"];
  return known.includes(result.reason) ? t(`duel.reason.${result.reason}` as TranslationKey, vars) : "";
}

export function DuelResultScreen(): JSX.Element {
  const { myId, duel, nameById, roleOverlay, waitingValidationStep, setWaitingValidationStep, sendReplayChoice } = useScreen();
  const { t } = useI18n();
  const result = duel.result;
  const won = result !== null && myId !== null && result.winners.includes(myId);
  const waiting = waitingValidationStep === "replay_choice";

  return (
    <main className="game-screen">
      <CardSurface
        scoreLeft={<DuelHeader />}
        scoreRight={<span className="score-chip">{t("duel.players")}</span>}
        meta={<div><p>{t("duel.over")}</p></div>}
        front={
          waiting ? (
            <WaitingCard message={t("endGame.replaySent")} />
          ) : result === null ? (
            <div />
          ) : (
            <div className="result-panel">
              <h2>{won ? t("duel.won") : t("duel.lost")}</h2>
              <p>{duelExplanation(result, nameById, t)}</p>
              <ul className="duel-roles">
                {Object.entries(result.roleMap).map(([id, faction]) => (
                  <li key={id}>
                    <FactionIcon faction={faction} /> <strong>{nameById(id)}</strong> · {faction === "nazi" ? t("duel.wasNazi") : t("duel.wasCommunist")}
                    {result.votes[id] !== undefined ? ` · ${result.votes[id] === "accuse" ? t("duel.votedAccuse") : t("duel.votedTrust")}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )
        }
        back={<DuelRulesPanel />}
        overlay={roleOverlay}
        actions={
          waiting ? undefined : (
          <div className="vote-stack">
            <button
              type="button"
              className="vote-btn"
              disabled={waiting}
              onClick={() => {
                setWaitingValidationStep("replay_choice");
                sendReplayChoice("replay");
              }}
            >
              {t("endGame.replay")}
            </button>
            <button type="button" className="secondary" disabled={waiting} onClick={() => sendReplayChoice("quit")}>
              {t("endGame.quit")}
            </button>
          </div>
          )
        }
      />
    </main>
  );
}
