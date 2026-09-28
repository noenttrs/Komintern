import { useI18n } from "../../i18n";

export function MissionProgress({ team, submittedPlayerIds }: { team: string[]; submittedPlayerIds: string[] }): JSX.Element {
  const { t } = useI18n();
  if (team.length === 0) {
    return <span className="progress-dots progress-dots--compact" role="img" aria-label={t("game.missionProgressAria")}>...</span>;
  }

  return (
    <span className="progress-dots progress-dots--compact" role="img" aria-label={`${t("game.missionProgressAria")} : ${submittedPlayerIds.filter((id) => team.includes(id)).length}/${team.length}`}>
      {team.map((playerId) => (
        <span key={playerId} className={submittedPlayerIds.includes(playerId) ? "dot dot--full" : "dot"} />
      ))}
    </span>
  );
}
