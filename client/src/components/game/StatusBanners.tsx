import { useEffect } from "react";

export function StatusBanners({
  error,
  onDismiss,
  notice,
  onDismissNotice,
  invite,
  onAcceptInvite,
  onDismissInvite,
  connection,
  inRoom,
}: {
  error: { message: string; id: number } | null;
  onDismiss: () => void;
  notice: { message: string; id: number } | null;
  onDismissNotice: () => void;
  invite: { code: string; fromName: string } | null;
  onAcceptInvite: () => void;
  onDismissInvite: () => void;
  connection: string;
  inRoom: boolean;
}): JSX.Element | null {
  useEffect(() => {
    if (error === null) {
      return;
    }
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [error, onDismiss]);

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const timer = window.setTimeout(onDismissNotice, 4000);
    return () => window.clearTimeout(timer);
  }, [notice, onDismissNotice]);

  const connectionMessage =
    !inRoom ? null : connection === "disconnected" ? "Connexion perdue, reconnexion en cours..." : connection === "connecting" ? "Connexion..." : null;

  if (error === null && connectionMessage === null && notice === null && invite === null) {
    return null;
  }
  return (
    <div className="status-banners" role="status" aria-live="polite" onClick={(event) => event.stopPropagation()}>
      {connectionMessage !== null ? <p className="status-banner status-banner--connection">{connectionMessage}</p> : null}
      {invite !== null ? (
        <div className="status-banner status-banner--invite">
          <span>{invite.fromName} t'invite dans la room {invite.code}</span>
          <button type="button" onClick={onAcceptInvite}>Rejoindre</button>
          <button type="button" className="secondary" onClick={onDismissInvite}>Ignorer</button>
        </div>
      ) : null}
      {notice !== null ? (
        <button type="button" className="status-banner status-banner--connection" onClick={onDismissNotice}>
          {notice.message}
        </button>
      ) : null}
      {error !== null ? (
        <button type="button" className="status-banner status-banner--error" onClick={onDismiss}>
          {error.message}
        </button>
      ) : null}
    </div>
  );
}
