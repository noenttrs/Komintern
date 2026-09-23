import { spawn } from "child_process";
import type { ChildProcessWithoutNullStreams } from "child_process";

import { log } from "./logger";

/** Erreur métier renvoyée par le moteur (`ok: false`) : son message est montrable aux joueurs. */
export class EngineError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

/** Panne du pont (timeout, process mort, sortie illisible) : détail dans les logs uniquement. */
export class BridgeFailure extends Error {
  public readonly detail: string;

  public constructor(detail: string) {
    super("game engine unavailable");
    this.name = "BridgeFailure";
    this.detail = detail;
  }
}

export type BridgeOptions = {
  /** Délai max d'une commande avant de considérer le moteur comme figé. */
  timeoutMs?: number;
  /** Appelé une seule fois si le process meurt sans qu'on l'ait demandé (crash, timeout). */
  onUnexpectedExit?: (reason: string) => void;
};

type Pending = {
  id: number;
  command: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const KILL_GRACE_MS = 2_000;
const MAX_STDOUT_BUFFER = 1_000_000;

/**
 * Pont NDJSON vers gameengine_entry.py. Chaque requête porte un `id` que le moteur renvoie :
 * une ligne parasite sur stdout ne peut plus décaler les réponses.
 */
export class PythonBridge {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, Pending>();
  private readonly timeoutMs: number;
  private readonly onUnexpectedExit?: (reason: string) => void;
  private stdoutBuffer = "";
  private nextId = 1;
  private closed = false;
  private disposing = false;
  private exited = false;

  public constructor(pythonPath: string, enginePath: string, options: BridgeOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onUnexpectedExit = options.onUnexpectedExit;
    this.child = spawn(pythonPath, [enginePath], { stdio: ["pipe", "pipe", "pipe"] });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.handleStdout(chunk));

    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      const text = chunk.trim();
      if (text.length > 0) {
        log.warn("python stderr", { text });
      }
    });

    // Sans ce handler, un EPIPE (moteur mort pendant une écriture) tuerait tout le serveur.
    this.child.stdin.on("error", (error) => this.fail(`stdin error: ${error.message}`));

    this.child.on("exit", (code, signal) => {
      this.exited = true;
      this.fail(`python process exited (code=${String(code)}, signal=${String(signal)})`);
    });
    this.child.on("error", (error) => this.fail(`python process error: ${error.message}`));
  }

  public send(command: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new BridgeFailure("bridge is closed"));
    }

    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(`command ${command} timed out after ${this.timeoutMs}ms`);
      }, this.timeoutMs);
      this.pending.set(id, { id, command, resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ id, command, args })}\n`, "utf8");
    });
  }

  /** Arrêt demandé : SIGTERM, puis SIGKILL si le process traîne. */
  public dispose(): void {
    if (this.disposing) {
      return;
    }
    this.disposing = true;
    this.closed = true;
    this.rejectAll(new BridgeFailure("bridge disposed"));
    this.terminate();
  }

  public kill(): void {
    this.dispose();
  }

  public get isClosed(): boolean {
    return this.closed;
  }

  private terminate(): void {
    if (this.exited) {
      return;
    }
    this.child.kill("SIGTERM");
    setTimeout(() => {
      if (!this.exited) {
        this.child.kill("SIGKILL");
      }
    }, KILL_GRACE_MS).unref();
  }

  private fail(reason: string): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    log.error("python bridge failure", { reason });
    this.rejectAll(new BridgeFailure(reason));
    this.terminate();
    if (!this.disposing) {
      this.onUnexpectedExit?.(reason);
    }
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    if (this.stdoutBuffer.length > MAX_STDOUT_BUFFER) {
      this.stdoutBuffer = "";
      this.fail("python stdout exceeded buffer limit without newline");
      return;
    }

    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        this.handleLine(line);
      }
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      log.warn("ignoring non-JSON python output", { line: line.slice(0, 200) });
      return;
    }

    if (typeof parsed !== "object" || parsed === null) {
      log.warn("ignoring malformed python response", { line: line.slice(0, 200) });
      return;
    }

    const response = parsed as { id?: unknown; ok?: unknown; result?: unknown; error?: unknown };
    const pending = typeof response.id === "number" ? this.pending.get(response.id) : undefined;
    if (pending === undefined) {
      log.warn("ignoring python response without matching request", { line: line.slice(0, 200) });
      return;
    }

    this.pending.delete(pending.id);
    clearTimeout(pending.timer);

    if (response.ok === true && "result" in response) {
      pending.resolve(response.result);
      return;
    }
    if (response.ok === false && typeof response.error === "string" && response.error.length > 0) {
      pending.reject(new EngineError(response.error));
      return;
    }
    pending.reject(new BridgeFailure(`malformed response to ${pending.command}: ${line.slice(0, 200)}`));
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
