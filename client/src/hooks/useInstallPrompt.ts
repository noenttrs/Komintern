import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Installation en web app : invite native (Chrome/Edge/Android) ou consigne pour iOS. */
export function useInstallPrompt(): { canPrompt: boolean; isIos: boolean; installed: boolean; install: () => Promise<void> } {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches === true,
  );

  useEffect(() => {
    const onPrompt = (event: Event): void => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = (): void => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return {
    canPrompt: promptEvent !== null,
    isIos: typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent),
    installed,
    install: async () => {
      if (promptEvent !== null) {
        await promptEvent.prompt();
        await promptEvent.userChoice;
        setPromptEvent(null);
      }
    },
  };
}
