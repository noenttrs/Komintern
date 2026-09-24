import type { BridgeLike } from "./GameSession";
import { BridgeFailure, PythonBridge } from "./PythonBridge";

export type EnginePoolOptions = {
  /** Nombre max de process Python ; chacun sert plusieurs parties (≈ 15 Mo par process). */
  workers?: number;
  timeoutMs?: number;
  /** Un process sans partie s'arrête après ce délai (RAM rendue quand le site est calme). */
  idleMs?: number;
};

type Worker = {
  bridge: PythonBridge;
  /** Parties servies par ce process → prévenues si le process meurt. */
  sessions: Map<string, (reason: string) => void>;
  idleTimer?: NodeJS.Timeout;
};

const DEFAULT_WORKERS = 4;
const DEFAULT_IDLE_MS = 60_000;

/**
 * Quelques process Python partagés par toutes les parties, au lieu d'un process par partie :
 * l'état d'une partie ne pèse que quelques Ko, l'interpréteur ~15 Mo. Les parties sont réparties
 * sur le process le moins chargé ; un crash n'interrompt que les parties de ce process.
 */
export class EnginePool {
  private readonly workers: Worker[] = [];
  private readonly maxWorkers: number;
  private readonly idleMs: number;
  private nextSession = 1;

  public constructor(
    private readonly pythonPath: string,
    private readonly enginePath: string,
    private readonly options: EnginePoolOptions = {},
  ) {
    this.maxWorkers = Math.max(1, options.workers ?? DEFAULT_WORKERS);
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  }

  /** Nombre de process vivants et de parties servies (supervision, tests). */
  public stats(): { workers: number; sessions: number } {
    return { workers: this.workers.length, sessions: this.workers.reduce((total, worker) => total + worker.sessions.size, 0) };
  }

  public open(onUnexpectedExit: (reason: string) => void): BridgeLike {
    const worker = this.pickWorker();
    const session = `g${this.nextSession++}`;
    worker.sessions.set(session, onUnexpectedExit);
    if (worker.idleTimer !== undefined) {
      clearTimeout(worker.idleTimer);
      worker.idleTimer = undefined;
    }
    let closed = false;
    return {
      send: (command, args) => (closed ? Promise.reject(new BridgeFailure("bridge disposed")) : worker.bridge.send(command, args, session)),
      dispose: () => {
        if (closed) return;
        closed = true;
        worker.sessions.delete(session);
        if (!worker.bridge.isClosed) void worker.bridge.send("close_session", {}, session).catch(() => undefined);
        this.scheduleIdle(worker);
      },
    };
  }

  /** Arrête tous les process (arrêt du serveur) ; le pool reste utilisable ensuite. */
  public dispose(): void {
    for (const worker of this.workers.splice(0)) {
      if (worker.idleTimer !== undefined) clearTimeout(worker.idleTimer);
      worker.sessions.clear();
      worker.bridge.dispose();
    }
  }

  /** Un process par partie tant qu'il en reste de libres (isolation), ensuite le moins chargé. */
  private pickWorker(): Worker {
    const idle = this.workers.find((worker) => worker.sessions.size === 0);
    if (idle !== undefined) return idle;
    if (this.workers.length < this.maxWorkers) return this.spawn();
    return this.workers.reduce((best, worker) => (worker.sessions.size < best.sessions.size ? worker : best));
  }

  private spawn(): Worker {
    const worker: Worker = { sessions: new Map(), bridge: undefined as unknown as PythonBridge };
    worker.bridge = new PythonBridge(this.pythonPath, this.enginePath, {
      timeoutMs: this.options.timeoutMs,
      onUnexpectedExit: (reason) => {
        this.remove(worker);
        const callbacks = [...worker.sessions.values()];
        worker.sessions.clear();
        for (const callback of callbacks) callback(reason);
      },
    });
    this.workers.push(worker);
    return worker;
  }

  private scheduleIdle(worker: Worker): void {
    if (worker.sessions.size > 0 || worker.idleTimer !== undefined || !this.workers.includes(worker)) return;
    worker.idleTimer = setTimeout(() => {
      worker.idleTimer = undefined;
      if (worker.sessions.size > 0) return;
      this.remove(worker);
      worker.bridge.dispose();
    }, this.idleMs);
    worker.idleTimer.unref();
  }

  private remove(worker: Worker): void {
    const index = this.workers.indexOf(worker);
    if (index >= 0) this.workers.splice(index, 1);
    if (worker.idleTimer !== undefined) {
      clearTimeout(worker.idleTimer);
      worker.idleTimer = undefined;
    }
  }
}
