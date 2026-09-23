import { spawn } from "child_process";
import type { ChildProcessWithoutNullStreams } from "child_process";

import { BridgeCommand, BridgeResponse } from "./types";

type QueueItem = {
  payload: BridgeCommand;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export class PythonBridge {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly queue: QueueItem[] = [];
  private stdoutBuffer = "";
  private activeItem: QueueItem | undefined;
  private closed = false;

  public constructor(pythonPath: string, enginePath: string) {
    this.child = spawn(pythonPath, [enginePath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.handleStdout(chunk);
    });

    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      const line = chunk.trim();
      if (line.length > 0) {
        console.error(`[python bridge stderr] ${line}`);
      }
    });

    this.child.on("exit", (code: number | null, signal: string | null) => {
      this.closed = true;
      this.rejectAll(`python process exited (code=${String(code)}, signal=${String(signal)})`);
    });

    this.child.on("error", (error: Error) => {
      this.closed = true;
      this.rejectAll(`python process error: ${error.message}`);
    });
  }

  public send(command: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error("python bridge is closed"));
    }

    return new Promise<unknown>((resolve, reject) => {
      this.queue.push({ payload: { command, args }, resolve, reject });
      this.flushQueue();
    });
  }

  public kill(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.child.kill();
    this.rejectAll("python bridge killed");
  }

  public dispose(): void {
    this.kill();
  }

  private flushQueue(): void {
    if (this.closed || this.activeItem !== undefined) {
      return;
    }

    const next = this.queue.shift();
    if (next === undefined) {
      return;
    }

    this.activeItem = next;
    const serialized = `${JSON.stringify(next.payload)}\n`;
    this.child.stdin.write(serialized, "utf8");
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;

    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      if (line.length === 0) {
        continue;
      }

      this.resolveResponse(line);
    }
  }

  private resolveResponse(line: string): void {
    const current = this.activeItem;
    if (current === undefined) {
      return;
    }

    let parsed: BridgeResponse;
    try {
      parsed = JSON.parse(line) as BridgeResponse;
    } catch (error) {
      this.activeItem = undefined;
      current.reject(new Error(`invalid JSON response from python: ${line}`));
      this.flushQueue();
      return;
    }

    if (typeof parsed !== "object" || parsed === null || typeof parsed.ok !== "boolean") {
      this.activeItem = undefined;
      current.reject(new Error("invalid bridge response from python"));
      this.flushQueue();
      return;
    }

    if (parsed.ok && !("result" in parsed)) {
      this.activeItem = undefined;
      current.reject(new Error("python bridge response missing result"));
      this.flushQueue();
      return;
    }

    if (!parsed.ok && (typeof parsed.error !== "string" || parsed.error.length === 0)) {
      this.activeItem = undefined;
      current.reject(new Error("python bridge response missing error message"));
      this.flushQueue();
      return;
    }

    this.activeItem = undefined;
    if (parsed.ok) {
      current.resolve(parsed.result);
    } else {
      current.reject(new Error(parsed.error ?? "unknown python bridge error"));
    }

    this.flushQueue();
  }

  private rejectAll(message: string): void {
    if (this.activeItem !== undefined) {
      this.activeItem.reject(new Error(message));
      this.activeItem = undefined;
    }

    while (this.queue.length > 0) {
      const queued = this.queue.shift();
      queued?.reject(new Error(message));
    }
  }
}
