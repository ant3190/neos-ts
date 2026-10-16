import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer, request } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { makeConfig } from "../resources/config.mjs";
import { ResourceManager } from "../resources/manager.mjs";
import { startResources } from "../resources/server.mjs";

async function fixture(t, options = {}) {
  const parent = await mkdtemp(path.join(os.tmpdir(), "neos-web-setup-"));
  const config = makeConfig({
    root: path.join(parent, "data"),
    configDir: path.join(parent, "config"),
    storageBase: "",
    host: "127.0.0.1",
    port: 0,
    autoSync: false,
    offline: true,
    ...options,
  });
  let app;
  const start = async () => {
    app = await startResources(config);
    return `http://127.0.0.1:${app.server.address().port}`;
  };
  let origin = await start();
  t.after(async () => {
    await app.close();
    await rm(parent, { recursive: true, force: true });
  });
  return {
    parent,
    config,
    get app() {
      return app;
    },
    get origin() {
      return origin;
    },
    get: async (route) => fetch(origin + route),
    post: async (directory, extra = {}) =>
      fetch(origin + "/api/resources/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extra },
        body: JSON.stringify({ directory }),
      }),
    restart: async () => {
      await app.close();
      origin = await start();
    },
  };
}

test("first-run HTTP service is healthy without a directory and gates every download until setup", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.get("/health")).status, 200);
  const initial = await (await f.get("/api/resources/setup")).json();
  assert.equal(initial.configured, false);
  assert.equal(initial.suggestedDirectory, f.config.root);
  assert.equal(existsSync(f.config.root), false);
  assert.equal(existsSync(f.config.configDir), false);
  assert.equal(
    (await (await f.get("/api/resources/status")).json()).phase,
    "setup",
  );
  const check = await fetch(f.origin + "/api/resources/check", {
    method: "POST",
  });
  assert.equal(check.status, 428);
  assert.equal((await check.json()).setupRequired, true);
  assert.equal(
    (await f.get("/local-resources/ygopro-database/zh-CN/cards.cdb")).status,
    428,
  );
  assert.equal(existsSync(f.config.root), false);

  const saved = await f.post(f.config.root);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).directory, f.config.root);
  assert.equal(existsSync(path.join(f.config.root, "state.sqlite")), true);
  const persisted = JSON.parse(
    await readFile(path.join(f.config.configDir, "storage.json"), "utf8"),
  );
  assert.equal(persisted.directory, f.config.root);
  assert.equal(
    (await (await f.get("/api/resources/status")).json()).setupRequired,
    false,
  );
  assert.equal((await f.get("/local-resources/storage.json")).status, 404);
  assert.equal((await f.get("/local-resources/state.sqlite")).status, 404);
  assert.equal((await f.post(f.config.root)).status, 200);
  const alternate = path.join(f.parent, "alternate");
  assert.equal((await f.post(alternate)).status, 409);
  assert.equal(existsSync(alternate), false);
  await f.restart();
  const restored = await (await f.get("/api/resources/setup")).json();
  assert.equal(restored.configured, true);
  assert.equal(restored.directory, f.config.root);
});

test("configured legacy data is reused only after webpage confirmation", async (t) => {
  const f = await fixture(t);
  const old = new ResourceManager(f.config);
  old.store.setting("checkedAt", 12345);
  await writeFile(
    path.join(f.config.root, "files", "kept-backup.bin"),
    "keep-me",
  );
  await old.close();
  await f.restart();
  assert.equal(
    (await (await f.get("/api/resources/setup")).json()).configured,
    false,
  );
  assert.equal((await f.post(f.config.root)).status, 200);
  assert.equal(f.app.manager.store.setting("checkedAt"), "12345");
  assert.equal(
    await readFile(
      path.join(f.config.root, "files", "kept-backup.bin"),
      "utf8",
    ),
    "keep-me",
  );
  await f.restart();
  assert.equal(f.app.manager.store.setting("checkedAt"), "12345");
});

test("invalid paths, project files, mount escapes and symlink escapes cannot become storage", async (t) => {
  const f = await fixture(t);
  const base = path.join(f.parent, "volume");
  await mkdir(base);
  f.config.storageBase = base;
  const outside = path.join(f.parent, "outside");
  await mkdir(outside);
  await symlink(outside, path.join(base, "escaped"));
  const project = fileURLToPath(new URL("../", import.meta.url));
  for (const directory of [
    "",
    " ",
    null,
    "relative",
    "/",
    project,
    f.config.configDir,
    outside,
    path.join(base, "../outside"),
    path.join(base, "escaped/new-data"),
  ]) {
    const response = await f.post(directory);
    assert.equal(response.status, 400, JSON.stringify(directory));
    await response.json();
  }
  assert.equal(
    existsSync(path.join(f.config.configDir, "storage.json")),
    false,
  );
  assert.equal(existsSync(path.join(outside, "new-data")), false);
  const directory = path.join(base, "卡片数据");
  const body = Buffer.from(JSON.stringify({ directory }));
  // Deliberately split a multibyte character between HTTP chunks.
  const split = body.indexOf(Buffer.from("卡")) + 1;
  const response = await new Promise((resolve, reject) => {
    const req = request(
      f.origin + "/api/resources/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: JSON.parse(Buffer.concat(chunks)),
          }),
        );
      },
    );
    req.on("error", reject);
    req.write(body.subarray(0, split));
    setImmediate(() => req.end(body.subarray(split)));
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.directory, directory);
});

test("a directory error preserves setup and can be corrected without restarting", async (t) => {
  const f = await fixture(t);
  const file = path.join(f.parent, "existing-file");
  await writeFile(file, "keep-me");
  const failed = await f.post(file);
  assert.equal(failed.status, 400);
  assert.match((await failed.json()).error, /路径|目录/);
  assert.equal(await readFile(file, "utf8"), "keep-me");
  assert.equal((await f.post(path.join(file, "nested"))).status, 400);
  assert.equal(
    (await (await f.get("/api/resources/setup")).json()).configured,
    false,
  );
  assert.equal(
    existsSync(path.join(f.config.configDir, "storage.json")),
    false,
  );
  assert.equal((await f.post(f.config.root)).status, 200);
  assert.equal(
    (await readdir(f.config.configDir)).some((name) => name.endsWith(".tmp")),
    false,
  );
});

test("corrupt saved settings show a recoverable setup error without choosing another directory", async (t) => {
  const f = await fixture(t);
  await mkdir(f.config.configDir);
  await writeFile(path.join(f.config.configDir, "storage.json"), "{broken");
  await f.restart();
  const status = await (await f.get("/api/resources/setup")).json();
  assert.equal(status.configured, false);
  assert.match(status.error, /无法打开/);
  assert.equal(existsSync(f.config.root), false);
  assert.equal((await f.post(f.config.root)).status, 200);
  await f.restart();
  assert.equal(
    (await (await f.get("/api/resources/setup")).json()).configured,
    true,
  );
});

test("concurrent first-run submissions keep the first directory and configuration", async (t) => {
  const f = await fixture(t);
  const roots = [path.join(f.parent, "first"), path.join(f.parent, "second")];
  const results = await Promise.all(
    roots.map(async (directory) => {
      const response = await f.post(directory);
      return {
        status: response.status,
        body: await response.json(),
        directory,
      };
    }),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const winner = results.find((result) => result.status === 200).directory;
  const loser = results.find((result) => result.status === 409).directory;
  assert.equal(existsSync(loser), false);
  await f.restart();
  assert.equal(
    (await (await f.get("/api/resources/setup")).json()).directory,
    winner,
  );
});

test("setup rejects cross-origin, non-JSON, malformed and oversized requests", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.post(f.config.root, { Origin: "https://unrelated.example" }))
      .status,
    403,
  );
  for (const [body, contentType, status] of [
    ["{}", "text/plain", 415],
    ["{", "application/json", 400],
    ["x".repeat(9000), "application/json", 413],
  ]) {
    const response = await fetch(f.origin + "/api/resources/setup", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
    assert.equal(response.status, status);
    await response.json();
  }
  assert.equal(existsSync(f.config.root), false);
  assert.equal((await f.post(f.config.root, { Origin: f.origin })).status, 200);
});

test("automatic synchronization starts only after a directory is confirmed", async (t) => {
  let requests = 0;
  const upstream = createServer((_req, res) => {
    requests++;
    res.end("!system 1000 Deck\n");
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    upstream.closeAllConnections();
    upstream.close();
  });
  const f = await fixture(t, {
    autoSync: true,
    offline: false,
    core: [
      {
        key: "ygopro-database/zh-CN/strings.conf",
        url: `http://127.0.0.1:${upstream.address().port}/strings.conf`,
        kind: "strings",
      },
    ],
  });
  await f.get("/api/resources/setup");
  await f.get("/local-resources/ygopro-database/zh-CN/strings.conf");
  assert.equal(requests, 0);
  assert.equal((await f.post(f.config.root)).status, 200);
  await f.app.manager.manager.checkTask;
  assert.equal(requests, 1);
  assert.equal(f.app.manager.status().update.phase, "complete");
});
