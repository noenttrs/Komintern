/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  /** « dev » : version de test (APP_CHANNEL à la construction de l'image). */
  readonly VITE_APP_CHANNEL?: string;
}
