export function MissionProgress({ team, submittedPlayerIds }: { team: string[]; submittedPlayerIds: string[] }): JSX.Element {
  if (team.length === 0) {
    return <span className="progress-dots progress-dots--compact" aria-label="progression de mission">...</span>;
  }

  return (
    <span className="progress-dots progress-dots--compact" aria-label="progression de mission">
      {team.map((playerId) => (
        <span key={playerId} className={submittedPlayerIds.includes(playerId) ? "dot dot--full" : "dot"} />
      ))}
    </span>
  );
}
