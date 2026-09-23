import type { Kv } from "../store/kv";

/** Limite à `max` actions par fenêtre de `windowSeconds` ; renvoie false si dépassé. */
export async function allow(kv: Kv, name: string, key: string, max: number, windowSeconds: number): Promise<boolean> {
  return (await kv.incrWithTtl(`rl:${name}:${key}`, windowSeconds)) <= max;
}
