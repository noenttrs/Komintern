import path from "path";

import { createKominternApp } from "./app";
import { log } from "./logger";
import { parsePositiveIntEnv } from "./validation";

const port = parsePositiveIntEnv(process.env.PORT, 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = createKominternApp({
  pythonPath: process.env.PYTHON_PATH ?? "python3",
  // Relatif au fichier compilé (server/dist/index.js), pas au dossier courant.
  enginePath: process.env.ENGINE_PATH ?? path.resolve(__dirname, "../../gameengine_entry.py"),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0),
  rateLimitMaxEvents: parsePositiveIntEnv(process.env.SOCKET_RATE_LIMIT_MAX_EVENTS, 80),
  rateLimitWindowMs: parsePositiveIntEnv(process.env.SOCKET_RATE_LIMIT_WINDOW_MS, 10_000),
  afkTimeoutMs: parsePositiveIntEnv(process.env.AFK_TIMEOUT_MS, 60_000),
  emptyRoomGraceMs: parsePositiveIntEnv(process.env.EMPTY_ROOM_GRACE_MS, 120_000),
  maxRooms: parsePositiveIntEnv(process.env.MAX_ROOMS, 1000),
  engineTimeoutMs: parsePositiveIntEnv(process.env.ENGINE_TIMEOUT_MS, 5_000),
  engineWorkers: parsePositiveIntEnv(process.env.ENGINE_WORKERS, 4),
});

app.httpServer.listen(port, host, () => {
  log.info("websocket server listening", { host, port });
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log.info("shutting down", { signal });
  // Arrêt forcé si la fermeture traîne : code non nul pour le signaler.
  setTimeout(() => process.exit(1), 5_000).unref();
  app
    .close()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      log.error("shutdown failed", { error });
      process.exit(1);
    });
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

// Une erreur non rattrapée laisse l'état en mémoire incohérent : on journalise puis on
// quitte avec un code d'erreur pour que Docker (restart: always) relance un process sain.
process.on("uncaughtException", (error) => {
  log.error("uncaught exception, exiting", { error });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandled rejection, exiting", { reason });
  process.exit(1);
});
