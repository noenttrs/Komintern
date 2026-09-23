import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "komintern.alerts";

export type AlertSettings = { vibration: boolean; sound: boolean };

function readSettings(): AlertSettings {
  try {
    return { vibration: true, sound: true, ...(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<AlertSettings>) };
  } catch {
    return { vibration: true, sound: true };
  }
}

let audioContext: AudioContext | null = null;

/** Deux notes brèves et douces, générées (aucun fichier son à charger). */
function chime(): void {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Context === undefined) return;
    audioContext ??= new Context();
    // Après un geste de l'utilisateur, le navigateur autorise le son : on le débloque pour la suite.
    if (audioContext.state === "suspended") void audioContext.resume();
    const now = audioContext.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = audioContext!.createOscillator();
      const gain = audioContext!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const start = now + index * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(gain).connect(audioContext!.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });
  } catch {
    // Audio indisponible : on ignore.
  }
}

function buzz(): void {
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate([60, 40, 60]);
  } catch {
    // Vibration indisponible : on ignore.
  }
}

/**
 * Prévient le joueur quand c'est à lui d'agir (vibration + petit son), une fois par occasion.
 * `turnKey` identifie l'occasion (ex. « vote-3-2 ») ; null quand il n'a rien à faire.
 */
export function useTurnAlerts(turnKey: string | null): [AlertSettings, (settings: AlertSettings) => void] {
  const [settings, setSettings] = useState<AlertSettings>(readSettings);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (turnKey === null || turnKey === lastKey.current) {
      return;
    }
    lastKey.current = turnKey;
    if (settings.vibration) {
      buzz();
    }
    if (settings.sound) {
      chime();
    }
  }, [turnKey, settings]);

  const update = (next: AlertSettings): void => {
    // Aperçu immédiat quand on active une alerte dans le menu.
    if (next.vibration && !settings.vibration) buzz();
    if (next.sound && !settings.sound) chime();
    setSettings(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Stockage indisponible : réglage valable pour cette visite seulement.
    }
  };

  return [settings, update];
}
