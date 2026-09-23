export function WaitingCard({ message }: { message: string }): JSX.Element {
  return (
    <div className="waiting-card-inline">
      <h2>Validation envoyee</h2>
      <p>{message}</p>
    </div>
  );
}
