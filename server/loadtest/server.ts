// Instance de test isolée : vrai moteur Python, stockage en mémoire, aucune donnée de prod.
import path from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";

import { createKominternApp } from "../src/app";
import { MemoryMailer } from "../src/auth/mailer";
import { loadConfig } from "../src/config";
import { memoryStores } from "../src/services";

const port = Number(process.env.PORT ?? 3100);
const app = createKominternApp({
  pythonPath: "python3",
  enginePath: path.resolve(__dirname, "../../gameengine_entry.py"),
  allowedOrigins: ["*"],
  rateLimitMaxEvents: 1_000,
  rateLimitWindowMs: 10_000,
  maxRooms: 2_000,
  config: loadConfig({ PUBLIC_URL: `http://localhost:${port}` }),
  stores: memoryStores(new MemoryMailer()),
});
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();
let cpu = process.cpuUsage();
let at = process.hrtime.bigint();
setInterval(() => {
  const now = process.hrtime.bigint();
  const used = process.cpuUsage(cpu);
  const elapsedUs = Number(now - at) / 1000;
  cpu = process.cpuUsage();
  at = now;
  const stats = app.roomManager.liveStats();
  console.log(JSON.stringify({
    t: Date.now(),
    cpuPct: Math.round(((used.user + used.system) / elapsedUs) * 100),
    rssMb: Math.round(process.memoryUsage().rss / 1048576),
    lagP99Ms: Math.round(lag.percentile(99) / 1e6),
    lagMaxMs: Math.round(lag.max / 1e6),
    ...stats,
  }));
  lag.reset();
}, 2000).unref();
app.httpServer.listen(port, "127.0.0.1", () => console.error(`load server on ${port}`));
