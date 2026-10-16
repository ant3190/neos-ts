import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { makeConfig } from "../resources/config.mjs";
import { ResourceManager } from "../resources/manager.mjs";
import { manifestKey } from "../resources/manifest.mjs";
import { createResourceServer } from "../resources/server.mjs";
import { NotFound, ResourceStore } from "../resources/store.mjs";

async function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "neos-resources-"));
  const files = new Map(),
    requests = [];
  const upstream = createServer(async (req, res) => {
    requests.push({ url: req.url, headers: req.headers });
    const entry = files.get(req.url);
    if (!entry) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (entry.delay)
      await new Promise((resolve) => setTimeout(resolve, entry.delay));
    const hash =
      entry.etag ||
      `"${createHash("sha256").update(entry.body).digest("hex")}"`;
    if (
      req.headers["if-none-match"] === hash &&
      !entry.status &&
      !entry.noValidators
    ) {
      res.writeHead(304);
      res.end();
      return;
    }
    res.writeHead(entry.status || 200, {
      "Content-Type": entry.type || "application/octet-stream",
      ...(!entry.noValidators && { ETag: hash }),
      "Content-Length": entry.body.length,
    });
    if (entry.chunkBytes) {
      for (
        let offset = 0;
        offset < entry.body.length;
        offset += entry.chunkBytes
      ) {
        if (res.destroyed) return;
        res.write(entry.body.subarray(offset, offset + entry.chunkBytes));
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      res.end();
    } else res.end(entry.body);
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${upstream.address().port}`;
  const set = (key, body, extras = {}) =>
    files.set(key, { body: Buffer.from(body), ...extras });
  const config = makeConfig({
    root,
    concurrency: 2,
    timeoutMs: 1000,
    retryDelayMs: 0,
    autoSync: false,
  });
  t.after(() => {
    upstream.closeAllConnections();
    upstream.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, files, requests, base, set, config };
}

function database(root, ids) {
  const filename = path.join(root, `source-${ids.join("-")}.cdb`);
  const db = new DatabaseSync(filename);
  db.exec(
    "CREATE TABLE datas (id INTEGER PRIMARY KEY); CREATE TABLE texts (id INTEGER PRIMARY KEY)",
  );
  for (const id of ids) {
    db.prepare("INSERT INTO datas VALUES (?)").run(id);
    db.prepare("INSERT INTO texts VALUES (?)").run(id);
  }
  db.close();
  return readFileSync(filename);
}

async function managerFixture(t) {
  const f = await fixture(t);
  for (const locale of ["zh-CN", "en-US"]) {
    f.set(
      `/db/${locale}/cards.cdb`,
      database(f.root, locale === "zh-CN" ? [101, 102] : [201]),
    );
    f.set(`/db/${locale}/strings.conf`, "!system 1000 Deck\n");
  }
  f.set("/ban.conf", "!2026-10\n101 1\n");
  f.set("/408.conf", "!408\n101 1\n");
  f.set("/pre.cdb", database(f.root, [301]));
  f.set("/pre.json", JSON.stringify([{ id: 301 }]));
  f.set(
    "/fonts.css",
    `@font-face {font-family: 'Electrolize';src: url(${f.base}/one.ttf)} @font-face {font-family: 'Noto Serif SC';src:url(${f.base}/two.ttf)}`,
  );
  f.set("/one.ttf", Buffer.from([0, 1, 0, 0, 1, 2]));
  f.set("/two.ttf", Buffer.from([0, 1, 0, 0, 3, 4]));
  for (const [locale, ids] of [
    ["zh-CN", [101, 102, 201]],
    ["en-US", [101, 102, 201]],
  ])
    for (const id of ids)
      f.set(
        `/pics/${locale}/${id}.jpg`,
        Buffer.from([255, 216, 255, 0, id % 255, 255, 217]),
      );
  f.set("/pre-pics/301.jpg", Buffer.from([255, 216, 255, 1, 255, 217]));
  const sources = {
    languages: ["zh-CN", "en-US"],
    imageLanguages: ["zh-CN", "en-US"],
    releaseResource: {
      cdb: `${f.base}/db/zh-CN/cards.cdb`,
      img: `${f.base}/pics/zh-CN`,
      lflist: `${f.base}/ban.conf`,
    },
    preReleaseResource: {
      cdb: `${f.base}/pre.cdb`,
      img: `${f.base}/pre-pics`,
      config: `${f.base}/pre.json`,
    },
    env408Resource: { lflist: `${f.base}/408.conf` },
    stringsUrl: `${f.base}/db/zh-CN/strings.conf`,
    fontsCss: `${f.base}/fonts.css`,
  };
  const config = makeConfig({
    root: f.root,
    sources,
    concurrency: 2,
    timeoutMs: 1000,
    retryDelayMs: 0,
    autoSync: false,
  });
  const manager = new ResourceManager(config);
  t.after(async () => {
    if (!manager.closed) await manager.close();
  });
  return { ...f, config, manager };
}

test("validators avoid downloads, same content keeps its file, and real changes replace it", async (t) => {
  const f = await fixture(t),
    store = new ResourceStore(f.config);
  t.after(() => store.close());
  const asset = {
    key: "strings.conf",
    url: `${f.base}/strings`,
    kind: "strings",
  };
  f.set("/strings", "!system 1 First\n");
  assert.equal((await store.update(asset)).changed, true);
  const before = statSync(store.file(asset.key)).mtimeMs,
    first = store.get(asset.key);
  assert.equal((await store.update(asset)).changed, false);
  assert.equal(f.requests.at(-1).headers["if-none-match"], first.etag);
  assert.equal(statSync(store.file(asset.key)).mtimeMs, before);
  f.set("/strings", "!system 1 First\n", { etag: '"new-validator"' });
  assert.equal((await store.update(asset)).changed, false);
  assert.equal(statSync(store.file(asset.key)).mtimeMs, before);
  f.set("/strings", "!system 1 Second\n");
  assert.equal((await store.update(asset)).changed, true);
  assert.match(store.read(asset.key), /Second/);
});

test("invalid content and outages preserve valid files and failed first downloads leave no partial file", async (t) => {
  const f = await fixture(t),
    store = new ResourceStore(f.config);
  t.after(() => store.close());
  const asset = { key: "cards.cdb", url: `${f.base}/db`, kind: "database" };
  f.set("/db", database(f.root, [99]));
  await store.update(asset);
  const original = readFileSync(store.file(asset.key));
  f.set("/db", "<html>upstream error</html>");
  assert.equal((await store.update(asset)).stale, true);
  assert.deepEqual(readFileSync(store.file(asset.key)), original);
  f.set("/db", "maintenance", { status: 503 });
  assert.equal((await store.update(asset)).stale, true);
  await assert.rejects(store.update({ ...asset, key: "new.cdb" }));
  assert.equal(store.has("new.cdb"), false);
  assert.deepEqual(readdirSync(store.work), []);
});

test("simultaneous downloads share one request, and deleting a cached file forces a full repair", async (t) => {
  const f = await fixture(t),
    store = new ResourceStore(f.config);
  t.after(() => store.close());
  f.set("/strings", "!system 1 First\n", { delay: 25 });
  const asset = {
    key: "strings.conf",
    url: `${f.base}/strings`,
    kind: "strings",
  };
  await Promise.all([
    store.update(asset),
    store.update(asset, { priority: true }),
  ]);
  assert.equal(f.requests.length, 1);
  unlinkSync(store.file(asset.key));
  await store.update(asset);
  assert.equal(f.requests.at(-1).headers["if-none-match"], undefined);
  assert.equal(store.has(asset.key), true);
});

test("a restarted store retains files and update validators", async (t) => {
  const f = await fixture(t);
  f.set("/strings", "!system 1 First\n");
  const asset = {
    key: "strings.conf",
    url: `${f.base}/strings`,
    kind: "strings",
  };
  const first = new ResourceStore(f.config);
  await first.update(asset);
  const etag = first.get(asset.key).etag;
  await first.close();
  const restarted = new ResourceStore(f.config);
  t.after(() => restarted.close());
  assert.equal(restarted.read(asset.key), "!system 1 First\n");
  await restarted.update(asset);
  assert.equal(f.requests.at(-1).headers["if-none-match"], etag);
});

test("transient download failures retry and a later page check can resume missing files", async (t) => {
  const f = await fixture(t),
    store = new ResourceStore(f.config);
  t.after(() => store.close());
  f.set("/strings", "!system 1 Available\n", { delay: 5, status: 503 });
  const asset = {
    key: "strings.conf",
    url: `${f.base}/strings`,
    kind: "strings",
  };
  // The first request has captured its failure response; the bounded retry sees recovery.
  const pending = store.update(asset);
  while (!f.requests.length)
    await new Promise((resolve) => setTimeout(resolve, 1));
  f.set("/strings", "!system 1 Available\n");
  assert.equal((await pending).changed, true);
  assert.equal(f.requests.length, 2);
  assert.match(store.read(asset.key), /Available/);
});

test("full synchronization covers both image languages, prerelease cards and fonts, then checks conditionally", async (t) => {
  const { manager, requests } = await managerFixture(t);
  await Promise.all([manager.check(), manager.check()]);
  await manager.mirrorTask;
  assert.equal(manager.status("cn").ready, true);
  assert.equal(manager.status("en").ready, true);
  for (const key of [
    "images/ygopro-images-zh-CN/101.jpg",
    "images/ygopro-images-zh-CN/102.jpg",
    "images/ygopro-images-en-US/201.jpg",
    "images/ygopro-images-zh-CN/201.jpg",
    "images/ygopro-images-en-US/101.jpg",
    "ygopro-super-pre/data/pics/301.jpg",
    "fonts/Electrolize.ttf",
    "fonts/NotoSerifSC-Bold.ttf",
  ])
    assert.equal(manager.store.has(key), true, key);
  assert.deepEqual(manager.progress, {
    total: 9,
    completed: 9,
    missing: 0,
    failed: 0,
  });
  const firstCount = requests.length,
    version = manager.status().version;
  await manager.check({ full: true });
  await manager.mirrorTask;
  assert.equal(manager.status().version, version);
  assert.equal(requests.length, firstCount * 2);
  assert.ok(
    requests.slice(firstCount).every((req) => req.headers["if-none-match"]),
  );
});

test("missing source art is reported without losing other resources or repeatedly fetching on demand", async (t) => {
  const { manager, files, requests, set } = await managerFixture(t);
  files.delete("/pics/zh-CN/102.jpg");
  await manager.check();
  await manager.mirrorTask;
  assert.equal(manager.progress.missing, 1);
  const missingJob = manager.status().update;
  assert.deepEqual(missingJob.missingResources, [
    { key: "images/ygopro-images-zh-CN/102.jpg", kind: "image" },
  ]);
  assert.equal(manager.store.has("images/ygopro-images-en-US/201.jpg"), true);
  const count = requests.length;
  await manager.check();
  assert.equal(manager.status().update.missing, 1);
  assert.equal(requests.length, count);
  await assert.rejects(
    manager.ensure("images/ygopro-images-zh-CN/102.jpg"),
    NotFound,
  );
  assert.equal(requests.length, count);
  set("/pics/zh-CN/102.jpg", Buffer.from([255, 216, 255, 102, 255, 217]));
  await manager.check({ retry: true });
  assert.equal(manager.status().update.missing, 0);
  assert.deepEqual(manager.status().update.missingResources, []);
  assert.equal(manager.store.has("images/ygopro-images-zh-CN/102.jpg"), true);
  assert.deepEqual(
    manager.status("cn", missingJob.id).update.missingResources,
    missingJob.missingResources,
  );
});

test("warm page checks reuse persisted validators, expired core checks stay small, and lost files repair immediately", async (t) => {
  const f = await managerFixture(t);
  await f.manager.check();
  await f.manager.close();
  const manager = new ResourceManager(f.config);
  t.after(() => manager.close());
  const count = f.requests.length;
  await manager.check();
  assert.equal(
    f.requests.length,
    count,
    "a restart must not invalidate freshness",
  );
  assert.equal(manager.status().update.assets.cached, 9);
  for (const asset of f.config.core)
    manager.store.db
      .prepare("UPDATE resources SET checked=? WHERE key=?")
      .run(Date.now() - f.config.coreMaxAgeMs - 1, asset.key);
  await manager.check();
  assert.equal(f.requests.length - count, f.config.core.length);
  assert.ok(
    f.requests
      .slice(count)
      .every((request) => request.headers["if-none-match"]),
  );
  const key = "images/ygopro-images-zh-CN/101.jpg";
  unlinkSync(manager.store.file(key));
  const beforeRepair = f.requests.length;
  await manager.check();
  assert.equal(f.requests.length - beforeRepair, 1);
  assert.equal(manager.store.has(key), true);
});

test("new database cards download immediately and existing artwork is periodically revalidated", async (t) => {
  const f = await managerFixture(t);
  await f.manager.check();
  f.set("/db/zh-CN/cards.cdb", database(f.root, [101, 102, 401]));
  f.manager.store.db
    .prepare("UPDATE resources SET checked=0 WHERE key=?")
    .run("ygopro-database/zh-CN/cards.cdb");
  for (const locale of ["zh-CN", "en-US"])
    f.set(`/pics/${locale}/401.jpg`, Buffer.from([255, 216, 255, 4, 255, 217]));
  const count = f.requests.length;
  await f.manager.check();
  assert.equal(f.requests.length - count, 3, "one database and two new images");
  assert.equal(f.manager.status().update.changed, 3);
  const key = "images/ygopro-images-zh-CN/101.jpg";
  f.set("/pics/zh-CN/101.jpg", Buffer.from([255, 216, 255, 5, 255, 217]));
  await f.manager.check();
  assert.equal(f.manager.status().update.changed, 0);
  f.manager.store.db
    .prepare("UPDATE resources SET checked=? WHERE key=?")
    .run(Date.now() - f.config.assetMaxAgeMs - 1, key);
  const beforeAudit = f.requests.length;
  await f.manager.check();
  assert.equal(f.requests.length - beforeAudit, 1);
  assert.equal(f.manager.status().update.changed, 1);
});

function publishManifest(f, overrides = {}) {
  const assets = [
    ...f.config.core,
    ...f.manager.images.values(),
    ...f.manager.fonts(),
  ];
  const files = Object.fromEntries(
    assets.map((asset) => [
      asset.key,
      createHash("sha256")
        .update(f.files.get(new URL(asset.url).pathname).body)
        .digest("hex"),
    ]),
  );
  f.set(
    "/manifest.json",
    JSON.stringify({ schema: 1, files: { ...files, ...overrides } }),
  );
}

async function indexedManager(f, t) {
  await f.manager.close();
  const manager = new ResourceManager({
    ...f.config,
    manifestUrl: `${f.base}/manifest.json`,
  });
  t.after(() => manager.close());
  return manager;
}

test("a remote hash manifest checks all saved resources in one request, including image-only changes", async (t) => {
  const f = await managerFixture(t);
  await f.manager.check();
  publishManifest(f);
  const manager = await indexedManager(f, t);
  let count = f.requests.length;
  await manager.check();
  assert.equal(f.requests.length - count, 1);
  assert.equal(
    manager.status().update.hasUpdates,
    false,
    "a new index is not a playable update",
  );
  count = f.requests.length;
  await manager.check();
  assert.equal(f.requests.length - count, 1);
  assert.ok(
    f.requests.at(-1).headers["if-none-match"],
    "the manifest itself is conditionally checked",
  );
  f.set("/pics/zh-CN/101.jpg", Buffer.from([255, 216, 255, 9, 255, 217]));
  publishManifest(f);
  count = f.requests.length;
  await manager.check();
  assert.equal(
    f.requests.length - count,
    2,
    "one manifest and only the changed image",
  );
  assert.equal(manager.status().update.changed, 1);
  assert.equal(
    f.requests.at(-1).headers["if-none-match"],
    undefined,
    "a known changed hash bypasses stale validators",
  );
  assert.deepEqual(
    readFileSync(manager.store.file("images/ygopro-images-zh-CN/101.jpg")),
    f.files.get("/pics/zh-CN/101.jpg").body,
  );
});

test("manifest hash mismatches preserve saved files and invalid or unavailable indexes fall back without claiming success", async (t) => {
  const f = await managerFixture(t);
  await f.manager.check();
  const key = "images/ygopro-images-zh-CN/101.jpg";
  const saved = readFileSync(f.manager.store.file(key));
  publishManifest(f, { [key]: "a".repeat(64) });
  const manager = await indexedManager(f, t);
  await manager.check();
  assert.equal(manager.status().update.phase, "partial");
  assert.equal(manager.status().update.failed, 1);
  assert.deepEqual(readFileSync(manager.store.file(key)), saved);
  const valid = manager.store.read(manifestKey);
  f.set(
    "/manifest.json",
    JSON.stringify({ schema: 1, files: { "../invalid.jpg": "a".repeat(64) } }),
  );
  await manager.check();
  assert.equal(manager.status().update.phase, "partial");
  assert.equal(
    manager.store.read(manifestKey),
    valid,
    "invalid indexes never replace the saved one",
  );
  assert.ok(
    manager.status().warnings.some((warning) => warning.includes("清单")),
  );
  f.files.get("/manifest.json").status = 503;
  await manager.check();
  assert.equal(manager.status().update.phase, "partial");
  assert.equal(
    manager.manifest.size,
    0,
    "an old index is not proof of current remote contents",
  );
});

test("manual full checks bypass freshness and a simultaneous quick job upgrades without changing its ID", async (t) => {
  const f = await managerFixture(t);
  await f.manager.check();
  publishManifest(f);
  const manager = await indexedManager(f, t);
  await manager.check();
  f.files.get("/manifest.json").delay = 25;
  const count = f.requests.length;
  const quick = manager.check();
  const id = manager.status().update.id;
  const full = manager.check({ full: true });
  await Promise.all([quick, full]);
  assert.equal(manager.status().update.id, id);
  assert.equal(manager.status().update.phase, "complete");
  assert.equal(manager.status().update.hasUpdates, false);
  assert.equal(manager.status().update.failed, 0);
  const checked = new Set(
    f.requests.slice(count).map((request) => request.url),
  );
  for (const asset of [
    ...f.config.core,
    ...f.manager.images.values(),
    ...f.manager.fonts(),
  ])
    assert.ok(checked.has(new URL(asset.url).pathname), asset.key);

  const key = "images/ygopro-images-zh-CN/101.jpg";
  writeFileSync(manager.store.file(key), "damaged local image");
  await manager.check({ full: true });
  assert.equal(manager.status().update.changed, 1);
  assert.deepEqual(
    readFileSync(manager.store.file(key)),
    f.files.get("/pics/zh-CN/101.jpg").body,
  );
});

async function cdnFixture(t) {
  const f = await fixture(t);
  const config = {
    ...f.config,
    sources: { ...f.config.sources, fallbackBase: "https://backup.example" },
  };
  const store = new ResourceStore(config);
  t.after(() => store.close());
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", (input, options) => {
    const url = new URL(input);
    if (url.hostname === "cdn02.moecube.com")
      return realFetch(`${f.base}/primary${url.pathname}`, options);
    if (url.hostname === "backup.example")
      return realFetch(`${f.base}/backup${url.pathname}`, options);
    return realFetch(input, options);
  });
  return {
    ...f,
    store,
    asset: {
      key: "strings.conf",
      url: "https://cdn02.moecube.com:444/strings.conf",
      kind: "strings",
    },
  };
}

test("a primary CDN 404 uses the backup, and a preferred backup 404 uses the primary", async (t) => {
  const f = await cdnFixture(t);
  f.set("/backup/strings.conf", "!system 1 Backup\n");
  assert.equal((await f.store.update(f.asset)).changed, true);
  assert.equal(f.store.get(f.asset.key).status, 200);
  assert.equal(f.store.setting("preferredCdn"), "https://backup.example");
  assert.deepEqual(
    f.requests.map((request) => request.url),
    ["/primary/strings.conf", "/backup/strings.conf"],
  );
  f.files.delete("/backup/strings.conf");
  f.set("/primary/strings.conf", "!system 1 Primary\n");
  assert.equal((await f.store.update(f.asset)).changed, true);
  assert.equal(f.store.read(f.asset.key), "!system 1 Primary\n");
  assert.equal(f.store.setting("preferredCdn"), "");
  assert.deepEqual(
    f.requests.slice(2).map((request) => request.url),
    ["/backup/strings.conf", "/primary/strings.conf"],
  );
});

test("only a 404 from every CDN creates a negative cache entry", async (t) => {
  const f = await cdnFixture(t);
  await assert.rejects(f.store.update(f.asset), NotFound);
  assert.equal(f.store.get(f.asset.key).status, 404);
  assert.equal(f.requests.length, 2);
  await assert.rejects(f.store.update(f.asset, { cached: true }), NotFound);
  assert.equal(f.requests.length, 2);
  f.set("/backup/strings.conf", "!system 1 Now available\n");
  assert.equal((await f.store.update(f.asset)).changed, true);
  assert.equal(f.store.get(f.asset.key).status, 200);
});

test("one CDN 404 and another CDN failure remain a download failure in either order", async (t) => {
  const f = await cdnFixture(t);
  await assert.rejects(f.store.update(f.asset), NotFound);
  assert.equal(f.store.get(f.asset.key).status, 404);
  for (const [primary, backup] of [
    [404, 503],
    [503, 404],
  ]) {
    f.set("/primary/strings.conf", "", { status: primary });
    f.set("/backup/strings.conf", "", { status: backup });
    await assert.rejects(
      f.store.update(f.asset),
      (error) => !(error instanceof NotFound) && /503/.test(error.message),
    );
    assert.equal(f.store.get(f.asset.key), undefined);
  }
  assert.equal(f.requests.length, 6);
});

test("offline refresh and process restart can serve saved resources without contacting the upstream", async (t) => {
  const f = await managerFixture(t);
  await f.manager.check();
  await f.manager.mirrorTask;
  for (const entry of f.files.values()) entry.status = 503;
  await f.manager.check({ full: true });
  await f.manager.mirrorTask;
  assert.equal(f.manager.status().ready, true);
  assert.ok(f.manager.status().warnings.length > 0);
  await f.manager.close();
  const restarted = new ResourceManager(f.config);
  t.after(() => restarted.close());
  const before = f.requests.length;
  await restarted.ensure("images/ygopro-images-zh-CN/101.jpg");
  await restarted.ensure("ygopro-database/zh-CN/cards.cdb");
  assert.equal(f.requests.length, before);
});

test("HTTP assets stream independently of the frontend filesystem and reject unknown paths and cross-origin updates", async (t) => {
  const f = await managerFixture(t);
  await f.manager.checkCore();
  const server = createResourceServer(f.manager);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const key = "images/ygopro-images-zh-CN/101.jpg",
    url = `${base}/local-resources/${key}`;
  const image = await fetch(url);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  const etag = image.headers.get("etag");
  await image.arrayBuffer();
  const count = f.requests.length;
  assert.equal(
    (await fetch(url, { headers: { "If-None-Match": etag } })).status,
    304,
  );
  assert.equal(f.requests.length, count);
  const head = await fetch(url, { method: "HEAD" });
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  // An old proxy must not cause a redirect into an unmounted frontend volume.
  const legacy = await fetch(url, { headers: { "X-Neos-Accel": "1" } });
  assert.equal(legacy.headers.get("x-accel-redirect"), null);
  assert.deepEqual(
    Buffer.from(await legacy.arrayBuffer()),
    readFileSync(f.manager.store.file(key)),
  );
  assert.equal(
    (
      await fetch(
        `${base}/local-resources/images/ygopro-images-zh-CN/999999.jpg`,
      )
    ).status,
    404,
  );
  assert.equal(
    (await fetch(`${base}/local-resources/state.sqlite`)).status,
    404,
  );
  assert.equal(f.requests.length, count);
  assert.equal(
    (
      await fetch(`${base}/api/resources/check`, {
        method: "POST",
        headers: { Origin: "https://other.example" },
      })
    ).status,
    403,
  );
  const status = await fetch(`${base}/api/resources/status`);
  assert.equal(status.headers.get("cache-control"), "no-store");
  assert.equal((await status.json()).ready, true);
  const update = await fetch(`${base}/api/resources/check`, {
    method: "POST",
    headers: { Origin: base },
  });
  assert.equal(update.status, 202);
  const joined = (await update.json()).update;
  await f.manager.checkTask;
  await f.manager.check();
  const history = await fetch(
    `${base}/api/resources/status?language=cn&job=${joined.id}`,
  );
  const original = (await history.json()).update;
  assert.equal(original.id, joined.id);
  assert.equal(original.phase, "complete");
  assert.equal(original.hasUpdates, true);
  assert.equal(f.manager.status().update.hasUpdates, false);
  const beforeFull = f.requests.length;
  const full = await fetch(`${base}/api/resources/check?full=1`, {
    method: "POST",
  });
  assert.equal(full.status, 202);
  await full.json();
  await f.manager.checkTask;
  assert.equal(
    f.requests.length - beforeFull,
    f.config.core.length + f.manager.images.size + f.manager.fonts().length,
  );
});

test("explicit offline mode serves saved files without any update or download traffic", async (t) => {
  const f = await managerFixture(t);
  await f.manager.check();
  await f.manager.mirrorTask;
  f.manager.config.offline = true;
  const count = f.requests.length;
  await f.manager.check();
  await f.manager.ensure("images/ygopro-images-en-US/101.jpg");
  unlinkSync(f.manager.store.file("images/ygopro-images-en-US/102.jpg"));
  await assert.rejects(f.manager.ensure("images/ygopro-images-en-US/102.jpg"));
  assert.equal(f.requests.length, count);
  assert.equal(f.manager.status().ready, true);
});

test("a sustained outage pauses a large mirror and the next check resumes after recovery", async (t) => {
  const f = await managerFixture(t);
  const ids = Array.from({ length: 30 }, (_, index) => index + 501);
  f.set("/db/zh-CN/cards.cdb", database(f.root, ids));
  for (const locale of ["zh-CN", "en-US"]) {
    for (const id of [...ids, 201])
      f.set(
        `/pics/${locale}/${id}.jpg`,
        Buffer.from([255, 216, 255, 0, 255, 217]),
        { status: 503 },
      );
  }
  await f.manager.check();
  await f.manager.mirrorTask;
  assert.ok(f.manager.progress.failed >= 12);
  assert.ok(f.manager.progress.completed < f.manager.progress.total);
  assert.ok(
    f.manager.status().warnings.some((message) => message.includes("中断")),
  );
  for (const entry of f.files.values()) delete entry.status;
  await f.manager.check();
  await f.manager.mirrorTask;
  assert.equal(f.manager.progress.failed, 0);
  assert.equal(f.manager.progress.completed, f.manager.progress.total);
  assert.equal(f.manager.store.has("images/ygopro-images-en-US/530.jpg"), true);
});

test("same-size replacements change nginx validators even within the same timestamp second", async (t) => {
  const f = await fixture(t),
    store = new ResourceStore(f.config);
  t.after(() => store.close());
  const asset = {
    key: "strings.conf",
    url: `${f.base}/strings`,
    kind: "strings",
  };
  f.set("/strings", "!system 1 First\n");
  await store.update(asset);
  const file = store.file(asset.key),
    size = statSync(file).size;
  const previousSecond = Math.floor(Date.now() / 1000) + 10;
  utimesSync(file, previousSecond, previousSecond);
  f.set("/strings", "!system 1 Other\n");
  await store.update(asset);
  assert.equal(statSync(file).size, size);
  assert.ok(Math.floor(statSync(file).mtimeMs / 1000) > previousSecond);
  assert.match(store.read(asset.key), /Other/);
});

test("update status reports live bytes and one shared job, and unchanged scans find no updates", async (t) => {
  const f = await managerFixture(t);
  f.files.get("/db/zh-CN/cards.cdb").chunkBytes = 1024;
  const first = f.manager.check();
  const deadline = Date.now() + 1000;
  while (
    !f.manager
      .status()
      .update.active.some(
        (item) => item.received > 0 && item.received < item.total,
      )
  ) {
    assert.ok(Date.now() < deadline, "streaming progress was not reported");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  const live = f.manager.status().update;
  assert.equal(live.phase, "checking");
  assert.equal(live.hasUpdates, true);
  assert.ok(live.downloadedBytes > 0);
  const second = f.manager.check();
  assert.equal(f.manager.status().update.id, live.id);
  await Promise.all([first, second]);
  const done = f.manager.status().update;
  assert.equal(done.phase, "complete");
  assert.equal(done.core.completed, done.core.total);
  assert.equal(done.assets.completed, done.assets.total);
  assert.equal(done.changed, f.files.size);
  assert.equal(
    done.downloadedBytes,
    [...f.files.values()].reduce((sum, file) => sum + file.body.length, 0),
  );
  assert.deepEqual(done.active, []);
  assert.ok(done.finishedAt >= done.startedAt);
  assert.equal(f.requests.length, f.files.size);

  await f.manager.check();
  const unchanged = f.manager.status().update;
  assert.notEqual(unchanged.id, done.id);
  assert.equal(unchanged.hasUpdates, false);
  assert.equal(unchanged.changed, 0);
  assert.equal(unchanged.downloadedBytes, 0);
  assert.equal(f.manager.status("cn", done.id).update.id, done.id);
  assert.equal(f.manager.status("cn", done.id).update.hasUpdates, true);
});

test("rotated validators and unversioned unchanged bodies do not announce updates, but changed art does", async (t) => {
  const f = await managerFixture(t);
  await f.manager.check({ full: true });
  const version = f.manager.status().version;
  for (const entry of f.files.values()) entry.etag = '"rotated"';
  await f.manager.check({ full: true });
  assert.equal(f.manager.status().update.hasUpdates, false);
  assert.equal(f.manager.status().update.changed, 0);
  assert.ok(f.manager.status().update.downloadedBytes > 0);
  for (const entry of f.files.values()) entry.noValidators = true;
  await f.manager.check({ full: true });
  assert.equal(f.manager.status().update.hasUpdates, false);
  f.set("/pics/zh-CN/101.jpg", Buffer.from([255, 216, 255, 77, 255, 217]), {
    noValidators: true,
  });
  await f.manager.check({ full: true });
  assert.equal(f.manager.status().version, version);
  assert.equal(f.manager.status().update.hasUpdates, true);
  assert.equal(f.manager.status().update.changed, 1);
});

test("failed downloads report partial completion and a new check can finish without losing old data", async (t) => {
  const f = await managerFixture(t);
  await f.manager.check();
  f.set("/ban.conf", "!New list\n101 2\n");
  f.files.get("/pics/zh-CN/101.jpg").status = 503;
  await f.manager.check({ full: true });
  const partial = f.manager.status().update;
  assert.equal(partial.phase, "partial");
  assert.equal(partial.hasUpdates, true);
  assert.equal(partial.changed, 1);
  assert.equal(partial.failed, 1);
  assert.equal(f.manager.status().ready, true);
  assert.ok(f.manager.store.has("images/ygopro-images-zh-CN/101.jpg"));
  delete f.files.get("/pics/zh-CN/101.jpg").status;
  await f.manager.check();
  assert.notEqual(f.manager.status().update.id, partial.id);
  assert.equal(f.manager.status().update.phase, "complete");
  assert.equal(f.manager.status().update.failed, 0);
});
