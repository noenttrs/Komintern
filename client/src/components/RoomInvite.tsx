import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { useI18n } from "../i18n";

/** Lien d'invitation /r/CODE : QR code à scanner autour de la table, partage ou copie. */
export function RoomInvite({ code }: { code: string }): JSX.Element {
  const { t } = useI18n();
  const link = `${window.location.origin}/r/${encodeURIComponent(code)}`;
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f0f0f", light: "#ffffff" } })
      .then((svg) => {
        if (!cancelled) setQr(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      })
      .catch(() => setQr(null));
    return () => {
      cancelled = true;
    };
  }, [link]);

  const share = async (): Promise<void> => {
    if (typeof navigator.share === "function") {
      await navigator.share({ title: "Nazi Communiste", text: t("invite.shareText", { code }), url: link }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(link).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="room-invite">
      <button type="button" className="mono room-code" title={t("invite.showQr")} onClick={() => setShowQr((current) => !current)}>
        {t("invite.room", { code })}
      </button>
      {showQr && qr !== null ? (
        // Plein écran : on tend le téléphone, les autres scannent.
        <div className="qr-overlay" role="dialog" aria-modal="true" aria-label={t("invite.qrDialog")} onClick={() => setShowQr(false)}>
          <p className="mono">{t("invite.scan")}</p>
          <img className="qr-overlay__img" src={qr} alt={t("invite.qrAlt", { code })} />
          <p className="qr-overlay__code">{code}</p>
          <button type="button" className="secondary" onClick={() => setShowQr(false)}>{t("common.close")}</button>
        </div>
      ) : null}
      <div className="room-invite__actions">
        <button type="button" className="secondary" onClick={() => setShowQr((current) => !current)}>
          {t("invite.qr")}
        </button>
        <button type="button" className="secondary" onClick={() => void share()}>
          {copied ? t("invite.copied") : t("invite.share")}
        </button>
      </div>
    </div>
  );
}
