import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { BridgeFailure, EngineError, PythonBridge } from "./PythonBridge";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "komintern-bridge-"));
after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

/** Écrit un faux moteur Python dont la boucle exécute `body` pour chaque requête `req`. */
function fakeEngine(name: string, body: string[]): string {
  const scriptPath = path.join(tempDir, `${name}.py`);
  fs.writeFileSync(
    scriptPath,
    ["import json, sys, time", "for line in sys.stdin:", "    req = json.loads(line)", ...body.map((l) => `    ${l}`), ""].join("\n"),
  );
  return scriptPath;
}

const reply = "print(json.dumps({'id': req['id'], 'ok': True, 'result': req['command']}), flush=True)";

test("stderr is a log stream and does not corrupt responses", async () => {
  const bridge = new PythonBridge("python3", fakeEngine("stderr", ["sys.stderr.write('warning\\n'); sys.stderr.flush()", reply]));
  assert.equal(await bridge.send("ping", {}), "ping");
  bridge.dispose();
});

test("stray stdout lines are ignored thanks to request ids", async () => {
  const bridge = new PythonBridge(
    "python3",
    fakeEngine("stray", ["print('debug output', flush=True)", "print(json.dumps({'id': 999, 'ok': True, 'result': 'x'}), flush=True)", reply]),
  );
  assert.deepEqual(await Promise.all([bridge.send("a", {}), bridge.send("b", {})]), ["a", "b"]);
  bridge.dispose();
});

test("engine errors surface as EngineError", async () => {
  const bridge = new PythonBridge(
    "python3",
    fakeEngine("error", ["print(json.dumps({'id': req['id'], 'ok': False, 'error': 'invalid team size'}), flush=True)"]),
  );
  await assert.rejects(bridge.send("propose_team", {}), (error: unknown) => error instanceof EngineError && error.message === "invalid team size");
  bridge.dispose();
});

test("a hung engine times out, is killed and reported once", async () => {
  const exits: string[] = [];
  const bridge = new PythonBridge("python3", fakeEngine("hang", ["time.sleep(30)"]), {
    timeoutMs: 200,
    onUnexpectedExit: (reason) => exits.push(reason),
  });
  await assert.rejects(bridge.send("slow", {}), BridgeFailure);
  await assert.rejects(bridge.send("after", {}), BridgeFailure);
  assert.equal(exits.length, 1);
  assert.match(exits[0] ?? "", /timed out/);
});

test("a crashing engine rejects pending requests and reports the exit", async () => {
  const exits: string[] = [];
  const bridge = new PythonBridge("python3", fakeEngine("crash", ["sys.exit(3)"]), {
    onUnexpectedExit: (reason) => exits.push(reason),
  });
  await assert.rejects(bridge.send("boom", {}), BridgeFailure);
  assert.equal(exits.length, 1);
  assert.match(exits[0] ?? "", /code=3/);
  assert.equal(bridge.isClosed, true);
});

test("dispose is not reported as an unexpected exit", async () => {
  const exits: string[] = [];
  const bridge = new PythonBridge("python3", fakeEngine("dispose", [reply]), { onUnexpectedExit: (reason) => exits.push(reason) });
  assert.equal(await bridge.send("ping", {}), "ping");
  bridge.dispose();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(exits, []);
  await assert.rejects(bridge.send("late", {}), BridgeFailure);
});

test("the real engine answers through the bridge", async () => {
  const bridge = new PythonBridge("python3", path.resolve(__dirname, "../../gameengine_entry.py"));
  const started = (await bridge.send("start_game", { player_ids: ["a", "b", "c", "d", "e"], chef_cursor: 2, seed: 1 })) as {
    round: { chef_id: string };
  };
  assert.equal(started.round.chef_id, "c");
  await assert.rejects(bridge.send("propose_team", { team: ["a"] }), EngineError);
  bridge.dispose();
});
