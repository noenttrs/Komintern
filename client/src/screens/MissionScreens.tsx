import { CardSurface } from "../components/game/CardSurface";
import { FactionIcon, scoreChip } from "../components/game/FactionIcon";
import { MissionProgress } from "../components/game/MissionProgress";
import { VoteButtons } from "../components/game/VoteButtons";
import { WaitingCard } from "../components/game/WaitingCard";
import { useI18n } from "../i18n";
import type { MissionVote } from "../types";
import { useScreen } from "./ScreenContext";

// Vote de mission (membres de l'équipe) et résultat de la mission.
export function MissionScreen(): JSX.Element {
  const {
    score,
    frontMeta,
    roleOverlay,
    showFullHistory,
    defaultBackContent,
    expandedBackContent,
    waitingValidationStep,
    missionProgressLabel,
    myId,
    role,
    mission,
    selectedMissionVote,
    setSelectedMissionVote,
    setWaitingValidationStep,
    sendMissionVote,
  } = useScreen();
  const { t } = useI18n();
  const onTeam = myId !== null && mission.team.includes(myId);
  const hasSubmittedMissionVote = myId !== null && mission.submittedPlayerIds.includes(myId);
  const missionProgress = <MissionProgress team={mission.team} submittedPlayerIds={mission.submittedPlayerIds} />;
  const missionFooter = <div><p>{missionProgressLabel}</p></div>;

  return (
    <main className="game-screen">
      <CardSurface
        scoreLeft={scoreChip("communist", score.communist)}
        scoreRight={scoreChip("nazi", score.nazi)}
        scoreCenter={missionProgress}
        meta={frontMeta}
        footer={missionFooter}
        front={
          waitingValidationStep === "mission_vote" || hasSubmittedMissionVote ? (
            <WaitingCard message={t("mission.waiting")} />
          ) : onTeam ? (
            <div className="vote-phase vote-phase--mission">
              <VoteButtons
                first={{ vote: "communist", symbol: <FactionIcon faction="communist" /> }}
                second={{ vote: "nazi", symbol: <FactionIcon faction="nazi" /> }}
                onVote={(value) => {
                  if (waitingValidationStep === "mission_vote" || hasSubmittedMissionVote) {
                    return;
                  }
                  const parsed = value as MissionVote;
                  setSelectedMissionVote(parsed);
                  setWaitingValidationStep("mission_vote");
                  sendMissionVote(parsed);
                }}
                disabled={waitingValidationStep === "mission_vote" || hasSubmittedMissionVote}
                selectedVote={selectedMissionVote}
                disabledVotes={role.faction === "communist" ? ["nazi"] : role.faction === "nazi" ? [] : ["communist", "nazi"]}
                split
                randomize
              />
            </div>
          ) : (
            <WaitingCard message={t("mission.waiting")} />
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={roleOverlay}
      />
    </main>
  );
}

export function MissionResultScreen(): JSX.Element {
  const {
    score,
    frontMeta,
    roleOverlay,
    showFullHistory,
    defaultBackContent,
    expandedBackContent,
    waitingValidationStep,
    missionProgressLabel,
    mission,
  } = useScreen();
  const { t } = useI18n();
  const missionProgress = <MissionProgress team={mission.team} submittedPlayerIds={mission.submittedPlayerIds} />;
  const naziVotes = mission.naziVoteCount ?? 0;
  const communistVotes = Math.max(0, mission.team.length - naziVotes);
  const roundWinner = mission.result;

  return (
    <main className="game-screen">
      <CardSurface
        scoreLeft={scoreChip("communist", score.communist)}
        scoreRight={scoreChip("nazi", score.nazi)}
        scoreCenter={missionProgress}
        meta={frontMeta}
        footer={<div><p>{missionProgressLabel}</p></div>}
        front={
          waitingValidationStep === "mission_result" ? (
            <WaitingCard message={t("common.sentWaitingOthers")} />
          ) : (
            <div className="result-panel result-panel--mission">
              <h2>{roundWinner === "nazi" ? t("mission.victoryNazi") : t("mission.victoryCommunist")}</h2>
              <p>{t("mission.naziVotes", { count: naziVotes })}</p>
              <p>{t("mission.communistVotes", { count: communistVotes })}</p>
              <p>{t("common.tapNext")}</p>
            </div>
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={roleOverlay}
      />
    </main>
  );
}
