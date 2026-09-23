type Handler = (payload?: unknown) => void;

/** Faux socket.io-client : enregistre les emits, permet de simuler les événements serveur. */
export class FakeSocket {
  public connected = false;
  public readonly emitted: Array<{ event: string; payload: unknown }> = [];
  private readonly handlers = new Map<string, Set<Handler>>();

  public on(event: string, handler: Handler): this {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  public off(event: string, handler: Handler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  public emit(event: string, payload?: unknown): this {
    this.emitted.push({ event, payload });
    return this;
  }

  public connect(): this {
    if (!this.connected) {
      this.connected = true;
      this.serverEmit("connect");
    }
    return this;
  }

  public drop(): void {
    this.connected = false;
    this.serverEmit("disconnect");
  }

  public serverEmit(event: string, payload?: unknown): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      handler(payload);
    }
  }

  public events(): string[] {
    return this.emitted.map((entry) => entry.event);
  }

  public reset(): void {
    this.connected = false;
    this.emitted.length = 0;
    this.handlers.clear();
  }
}
