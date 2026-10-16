import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { makeConfig } from "../resources/config.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));

test("resource data defaults outside the repository and accepts a custom directory", () => {
  const names = ["NEOS_RESOURCE_DIR", "NEOS_RESOURCE_DATA_DIR"];
  const original = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    assert.equal(makeConfig().root, path.resolve(project, "../neos-data"));
    process.env.NEOS_RESOURCE_DATA_DIR = path.join(
      os.tmpdir(),
      "neos-custom-data",
    );
    assert.equal(makeConfig().root, process.env.NEOS_RESOURCE_DATA_DIR);
    process.env.NEOS_RESOURCE_DIR = path.join(os.tmpdir(), "neos-legacy-data");
    assert.equal(makeConfig().root, process.env.NEOS_RESOURCE_DIR);
  } finally {
    names.forEach((name, i) => {
      if (original[i] === undefined) delete process.env[name];
      else process.env[name] = original[i];
    });
  }
});

test(
  "one development command starts both services and proxies to its actual resource port",
  { timeout: 30000 },
  async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "neos-external-data-"));
    const reserve = createServer();
    await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
    const port = reserve.address().port;
    await new Promise((resolve) => reserve.close(resolve));
    const child = spawn(
      process.execPath,
      [
        "resources/dev.mjs",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--strictPort",
      ],
      {
        cwd: project,
        env: {
          ...process.env,
          NEOS_RESOURCE_DIR: root,
          NEOS_RESOURCE_PORT: "0",
          NEOS_RESOURCE_HOST: "127.0.0.1",
          NEOS_RESOURCE_AUTO_SYNC: "0",
          NEOS_RESOURCE_OFFLINE: "1",
          NEOS_RESOURCE_URL: "http://unused-old-resource-project:1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (data) => {
      output = (output + data).slice(-16000);
    });
    child.stderr.on("data", (data) => {
      output = (output + data).slice(-16000);
    });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const ended = once(child, "exit");
        child.kill("SIGTERM");
        const limit = setTimeout(() => child.kill("SIGKILL"), 5000);
        await ended;
        clearTimeout(limit);
      }
      rmSync(root, { recursive: true, force: true });
    });
    let status;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      assert.equal(child.exitCode, null, output);
      try {
        const response = await fetch(
          `http://127.0.0.1:${port}/api/resources/status`,
          { signal: AbortSignal.timeout(1000) },
        );
        const body = await response.text();
        if (response.ok) {
          status = JSON.parse(body);
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(status, output);
    assert.equal(status.phase, "idle");
    assert.equal(status.update, null);
    assert.equal(status.ready, false);
    assert.ok(existsSync(path.join(root, "state.sqlite")));
    assert.ok(existsSync(path.join(root, "files")));
    const check = await fetch(
      `http://127.0.0.1:${port}/api/resources/check?language=cn`,
      { method: "POST" },
    );
    assert.equal(check.status, 202);
    assert.equal((await check.json()).update, null);
    const privateFile = await fetch(
      `http://127.0.0.1:${port}/local-resources/state.sqlite`,
    );
    assert.equal(privateFile.status, 404);
    await privateFile.text();
  },
);
