import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { EnginePool } from "./EnginePool";
import { BridgeFailure } from "./PythonBridge";

const ENGINE = path.resolve(__dirname, "../../gameengine_entry.py");
const PLAYERS = ["a", "b", "c", "d", "e"];
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "komintern-pool-"));
after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("games sharing one process keep separate states", async () => {
  const pool = new EnginePool("python3", ENGINE, { workers: 1 });
  const first = pool.open(() => assert.fail("no crash expected"));
  const second = pool.open(() => assert.fail("no crash expected"));
  await first.send("start_game", { player_ids: PLAYERS, chef_cursor: 0, seed: 1 });
  await second.send("start_game", { player_ids: PLAYERS, chef_cursor: 3, seed: 2 });
  assert.equal(((await first.send("get_round_state", {})) as { chef_id: string }).chef_id, "a");
  assert.equal(((await second.send("get_round_state", {})) as { chef_id: string }).chef_id, "d");
  assert.deepEqual(pool.stats(), { workers: 1, sessions: 2 });

  first.dispose();
  await assert.rejects(first.send("get_round_state", {}), BridgeFailure);
  assert.deepEqual(pool.stats(), { workers: 1, sessions: 1 });
  second.dispose();
  pool.dispose();
});

test("games spread over free processes first, then the least loaded one", () => {
  const pool = new EnginePool("python3", ENGINE, { workers: 2 });
  const handles = [0, 1, 2].map(() => pool.open(() => undefined));
  assert.deepEqual(pool.stats(), { workers: 2, sessions: 3 });
  handles.forEach((handle) => handle.dispose());
  pool.dispose();
});

test("a crashed process only ends its own games, and the next game gets a fresh process", async () => {
  const script = path.join(tempDir, "crash.py");
  fs.writeFileSync(
    script,
    [
      "import json, sys",
      "for line in sys.stdin:",
      "    req = json.loads(line)",
      "    if req['command'] == 'crash': sys.exit(3)",
      "    print(json.dumps({'id': req['id'], 'ok': True, 'result': req.get('session')}), flush=True)",
      "",
    ].join("\n"),
  );
  const pool = new EnginePool("python3", script, { workers: 2 });
  const failures: string[] = [];
  const doomed = pool.open((reason) => failures.push(`doomed: ${reason}`));
  const safe = pool.open((reason) => failures.push(`safe: ${reason}`));
  await assert.rejects(doomed.send("crash", {}), BridgeFailure);
  await sleep(50);
  assert.equal(failures.length, 1);
  assert.match(failures[0] ?? "", /^doomed: python process exited/);
  assert.equal(typeof (await safe.send("ping", {})), "string");
  const fresh = pool.open(() => undefined);
  assert.equal(typeof (await fresh.send("ping", {})), "string");
  assert.equal(pool.stats().workers, 2);
  pool.dispose();
});

test("an idle process is stopped to give its memory back", async () => {
  const pool = new EnginePool("python3", ENGINE, { workers: 2, idleMs: 50 });
  const handle = pool.open(() => undefined);
  await handle.send("duel_start", { player_ids: ["a", "b"], seed: 1 });
  handle.dispose();
  assert.equal(pool.stats().workers, 1);
  await sleep(150);
  assert.deepEqual(pool.stats(), { workers: 0, sessions: 0 });
  pool.dispose();
});
