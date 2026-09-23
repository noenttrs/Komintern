type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveMinLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "silent") {
    return Number.POSITIVE_INFINITY;
  }
  if (raw in LEVEL_ORDER) {
    return LEVEL_ORDER[raw as Level];
  }
  return process.env.NODE_ENV === "test" ? LEVEL_ORDER.error : LEVEL_ORDER.info;
}

const minLevel = resolveMinLevel();

function write(level: Level, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < minLevel) {
    return;
  }
  // Une ligne JSON par événement : lisible par `docker compose logs` et facile à filtrer.
  const entry = { time: new Date().toISOString(), level, message, ...context };
  const line = JSON.stringify(entry, (_key, value: unknown) =>
    value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value,
  );
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};
