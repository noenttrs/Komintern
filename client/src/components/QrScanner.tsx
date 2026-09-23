import { useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n";
import { joinCodeFromPath } from "../router";

// Scan du QR code d'une room sans quitter l'app (la caméra du téléphone ouvrirait Safari).
// BarcodeDetector quand le navigateur le propose (Android), sinon jsQR (iPhone), chargé à la demande.

/** Code de room contenu dans un QR code : uniquement un lien /r/CODE de ce site. */
export function roomCodeFromQr(text: string, origin = window.location.origin): string | null {
  try {
    const url = new URL(text.trim());
    return url.origin === origin ? joinCodeFromPath(url.pathname) : null;
  } catch {
    return null;
  }
}

type Detect = (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>;

async function createDetector(): Promise<Detect> {
  const Native = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
  if (Native !== undefined) {
    const detector = new Native({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import("jsqr");
  return async (video, canvas) => {
    const width = Math.min(640, video.videoWidth);
    const height = Math.round((video.videoHeight / video.videoWidth) * width);
    if (width === 0 || height === 0) return null;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) return null;
    context.drawImage(video, 0, 0, width, height);
    return jsQR(context.getImageData(0, 0, width, height).data, width, height)?.data ?? null;
  };
}

export function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }): JSX.Element {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [problem, setProblem] = useState<"denied" | "unavailable" | "foreign" | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let stopped = false;
    const stop = () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };

    (async () => {
      if (navigator.mediaDevices?.getUserMedia === undefined) {
        setProblem("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch (error) {
        setProblem(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "unavailable");
        return;
      }
      if (stopped || videoRef.current === null) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
      const detect = await createDetector();
      const tick = async () => {
        if (stopped || videoRef.current === null || canvasRef.current === null) return;
        try {
          const text = await detect(videoRef.current, canvasRef.current);
          if (text !== null) {
            const code = roomCodeFromQr(text);
            if (code !== null) {
              stop();
              onCode(code);
              return;
            }
            setProblem("foreign");
          }
        } catch {
          // Image illisible : on réessaie à la prochaine.
        }
        timer = window.setTimeout(() => void tick(), 200);
      };
      void tick();
    })();

    return stop;
  }, [onCode]);

  return (
    <div className="qr-scanner" role="dialog" aria-modal="true" aria-label={t("scanner.title")}>
      <p className="qr-scanner__title">{t("scanner.title")}</p>
      <div className="qr-scanner__frame">
        <video ref={videoRef} playsInline muted aria-hidden="true" />
        <canvas ref={canvasRef} hidden />
      </div>
      <p className="qr-scanner__hint" role="status">
        {problem === "denied" ? t("scanner.denied") : problem === "unavailable" ? t("scanner.unavailable") : problem === "foreign" ? t("scanner.foreign") : t("scanner.hint")}
      </p>
      <button type="button" className="secondary" onClick={onClose}>
        {t("scanner.close")}
      </button>
    </div>
  );
}
