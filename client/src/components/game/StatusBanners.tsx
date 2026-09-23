import { useEffect } from "react";

import { useI18n } from "../../i18n";

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
  const { t } = useI18n();
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
    !inRoom ? null : connection === "disconnected" ? t("status.connectionLost") : connection === "connecting" ? t("status.connecting") : null;

  if (error === null && connectionMessage === null && notice === null && invite === null) {
    return null;
  }
  return (
    <div className="status-banners" role="status" aria-live="polite" onClick={(event) => event.stopPropagation()}>
      {connectionMessage !== null ? <p className="status-banner status-banner--connection">{connectionMessage}</p> : null}
      {invite !== null ? (
        <div className="status-banner status-banner--invite">
          <span>{t("status.invite", { name: invite.fromName, code: invite.code })}</span>
          <button type="button" onClick={onAcceptInvite}>{t("common.join")}</button>
          <button type="button" className="secondary" onClick={onDismissInvite}>{t("status.ignore")}</button>
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
