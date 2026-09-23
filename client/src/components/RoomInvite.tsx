import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Lien d'invitation /r/CODE : QR code à scanner autour de la table, partage ou copie. */
export function RoomInvite({ code }: { code: string }): JSX.Element {
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
      await navigator.share({ title: "Nazi Communiste", text: `Rejoins ma partie (room ${code})`, url: link }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(link).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="room-invite">
      <button type="button" className="mono room-code" title="Afficher le QR code" onClick={() => setShowQr((current) => !current)}>
        Room {code}
      </button>
      {showQr && qr !== null ? (
        // Plein écran : on tend le téléphone, les autres scannent.
        <div className="qr-overlay" role="dialog" aria-modal="true" aria-label="QR code de la room" onClick={() => setShowQr(false)}>
          <p className="mono">Scannez pour rejoindre</p>
          <img className="qr-overlay__img" src={qr} alt={`QR code pour rejoindre la room ${code}`} />
          <p className="qr-overlay__code">{code}</p>
          <button type="button" className="secondary" onClick={() => setShowQr(false)}>Fermer</button>
        </div>
      ) : null}
      <div className="room-invite__actions">
        <button type="button" className="secondary" onClick={() => setShowQr((current) => !current)}>
          QR code
        </button>
        <button type="button" className="secondary" onClick={() => void share()}>
          {copied ? "Lien copié !" : "Partager le lien"}
        </button>
      </div>
    </div>
  );
}
