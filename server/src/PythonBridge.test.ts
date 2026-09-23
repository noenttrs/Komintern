import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PythonBridge } from "./PythonBridge";

test("PythonBridge keeps stderr as a log stream", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "komintern-bridge-"));
  const scriptPath = path.join(tempDir, "bridge.py");

  fs.writeFileSync(
    scriptPath,
    [
      "import json",
      "import sys",
      "",
      "for line in sys.stdin:",
      "    payload = json.loads(line)",
      "    sys.stderr.write('bridge warning\\n')",
      "    sys.stderr.flush()",
      "    print(json.dumps({'ok': True, 'result': {'echo': payload['command']}}))",
      "    sys.stdout.flush()",
      "",
    ].join("\n"),
  );

  const bridge = new PythonBridge("python3", scriptPath);
  const result = await bridge.send("ping", {});

  assert.deepEqual(result, { echo: "ping" });
  bridge.kill();
});
