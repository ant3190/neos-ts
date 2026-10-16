import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import {
  readFile,
  readdir,
  rename,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { parseManifest } from "./manifest.mjs";

export class NotFound extends Error {}

const missingMaxAgeMs = 3600_000;

function fresh(row, maxAgeMs, now = Date.now()) {
  return row?.checked > 0 && now >= row.checked && now - row.checked < maxAgeMs;
}

function sourceVersion(asset, row) {
  // A lagging index must not downgrade a newer file already fetched from a CDN.
  if (
    asset.remote &&
    Date.parse(row?.modified) > Date.parse(asset.remote.modified)
  )
    return { ...asset, remote: undefined };
  return asset;
}

function versionMatches(asset, row, maxAgeMs, now = Date.now()) {
  if (asset.sha256) return row.hash === asset.sha256;
  if (asset.remote)
    return row.etag === asset.remote.etag && row.size === asset.remote.size;
  return fresh(row, maxAgeMs, now);
}

function sameMissingVersion(asset, row) {
  return (
    (!asset.sha256 || row.hash === asset.sha256) &&
    (!asset.remote ||
      (row.etag === asset.remote.etag && row.size === asset.remote.size))
  );
}

class Slots {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
    this.queue = [];
  }
  async acquire(priority) {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    await new Promise((resolve) =>
      priority ? this.queue.unshift(resolve) : this.queue.push(resolve),
    );
  }
  release() {
    const next = this.queue.shift();
    if (next) next();
    else this.active--;
  }
}

export function cardIds(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db
      .prepare("SELECT id FROM datas ORDER BY id")
      .all()
      .map((row) => Number(row.id));
  } finally {
    db.close();
  }
}

function validate(bytes, kind) {
  const text = () => bytes.toString("utf8");
  if (kind === "database") {
    if (bytes.subarray(0, 16).toString() !== "SQLite format 3\0")
      throw new Error("Invalid card database");
  } else if (kind === "image") {
    if (
      !(bytes[0] === 0xff && bytes[1] === 0xd8) &&
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      !(
        bytes.subarray(0, 4).toString() === "RIFF" &&
        bytes.subarray(8, 12).toString() === "WEBP"
      )
    )
      throw new Error("Invalid card image");
  } else if (kind === "font") {
    if (
      !bytes.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])) &&
      !["OTTO", "wOFF", "wOF2"].includes(bytes.subarray(0, 4).toString())
    )
      throw new Error("Invalid font");
  } else if (kind === "prerelease") {
    const list = JSON.parse(text());
    if (
      !Array.isArray(list) ||
      list.some((card) => !Number.isSafeInteger(card.id) || card.id <= 0)
    )
      throw new Error("Invalid prerelease list");
  } else if (kind === "strings") {
    if (!/^!system\s+\d+\s+/m.test(text()))
      throw new Error("Invalid strings file");
  } else if (kind === "banlist") {
    if (!/^![^\r\n]+/m.test(text())) throw new Error("Invalid banlist");
  } else if (kind === "css") {
    if (!text().includes("@font-face"))
      throw new Error("Invalid font stylesheet");
  } else if (kind === "manifest") {
    parseManifest(text());
  }
}

/** Files are committed by rename; SQLite keeps validators across container rebuilds. */
export class ResourceStore {
  constructor(config) {
    this.config = config;
    this.files = path.join(config.root, "files");
    this.work = path.join(config.root, "work");
    mkdirSync(this.files, { recursive: true });
    mkdirSync(this.work, { recursive: true });
    this.db = new DatabaseSync(path.join(config.root, "state.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS resources (key TEXT PRIMARY KEY, url TEXT NOT NULL, etag TEXT, modified TEXT, hash TEXT, size INTEGER DEFAULT 0, checked INTEGER NOT NULL, status INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
    );
    this.inflight = new Map();
    this.slots = new Slots(config.concurrency);
    this.abort = new AbortController();
  }
  file(key) {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(key) ||
      key.split("/").some((part) => !part || part === "." || part === "..")
    )
      throw new Error("Invalid resource path");
    return path.join(this.files, key);
  }
  get(key) {
    return this.db.prepare("SELECT * FROM resources WHERE key=?").get(key);
  }
  has(key) {
    return existsSync(this.file(key));
  }
  setting(key, value) {
    if (value !== undefined)
      this.db
        .prepare("INSERT OR REPLACE INTO settings VALUES (?, ?)")
        .run(key, String(value));
    return this.db.prepare("SELECT value FROM settings WHERE key=?").get(key)
      ?.value;
  }
  counts() {
    return this.db
      .prepare(
        "SELECT count(*) count, coalesce(sum(size),0) bytes FROM resources WHERE status=200",
      )
      .get();
  }
  hash(keys) {
    return createHash("sha256")
      .update(
        keys.map((key) => `${key}:${this.get(key)?.hash || ""}`).join("\n"),
      )
      .digest("hex")
      .slice(0, 20);
  }
  read(key) {
    return readFileSync(this.file(key), "utf8");
  }
  async plan(assets, { full = false, retry = false, maxAgeMs = 0 } = {}) {
    if (full) return { pending: assets, cached: 0, missing: [] };
    // One SQLite query and directory listing instead of a query/stat per card.
    const rows = new Map(
      this.db
        .prepare(
          "SELECT key,url,checked,status,hash,etag,size,modified FROM resources",
        )
        .all()
        .map((row) => [row.key, row]),
    );
    const files = new Set(
      (await readdir(this.files, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) =>
          path
            .relative(this.files, path.join(entry.parentPath, entry.name))
            .split(path.sep)
            .join("/"),
        ),
    );
    const pending = [],
      missing = [];
    const now = Date.now();
    let cached = 0;
    for (const item of assets) {
      const row = rows.get(item.key);
      const asset = sourceVersion(item, row);
      if (row?.url === asset.url) {
        if (
          files.has(asset.key) &&
          row.status === 200 &&
          versionMatches(asset, row, maxAgeMs, now)
        ) {
          cached++;
          continue;
        }
        if (
          !retry &&
          !files.has(asset.key) &&
          row.status === 404 &&
          sameMissingVersion(asset, row) &&
          fresh(row, missingMaxAgeMs, now)
        ) {
          missing.push(asset);
          continue;
        }
      }
      pending.push(asset);
    }
    return { pending, cached, missing };
  }
  async update(
    asset,
    { priority = false, cached = false, maxAgeMs = 0, full = false } = {},
  ) {
    const existing = this.inflight.get(asset.key);
    if (existing) return existing;
    if (cached && this.has(asset.key)) return { changed: false, cached: true };
    const previous = this.get(asset.key);
    asset = sourceVersion(asset, previous);
    if (
      previous?.url === asset.url &&
      previous.status === 200 &&
      !full &&
      versionMatches(asset, previous, maxAgeMs) &&
      this.has(asset.key)
    )
      return { changed: false, cached: true };
    if (
      cached &&
      previous?.url === asset.url &&
      previous?.status === 404 &&
      sameMissingVersion(asset, previous) &&
      fresh(previous, missingMaxAgeMs)
    )
      throw new NotFound(asset.key);
    const task = this.download(asset, priority, full).finally(() =>
      this.inflight.delete(asset.key),
    );
    this.inflight.set(asset.key, task);
    return task;
  }
  async readUpstream(asset, headers) {
    if (this.config.offline)
      throw new Error("Resource not cached in offline mode");
    const fallback = this.config.sources.fallbackBase;
    const canUseFallback =
      fallback && new URL(asset.url).hostname === "cdn02.moecube.com";
    const alternative = canUseFallback
      ? new URL(new URL(asset.url).pathname, fallback).href
      : asset.url;
    const preferred =
      canUseFallback && this.setting("preferredCdn") === fallback;
    const urls = [
      ...new Set(
        preferred ? [alternative, asset.url] : [asset.url, alternative],
      ),
    ];
    const notFound = new Set();
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.abort.signal.aborted) throw this.abort.signal.reason;
      try {
        const signal = AbortSignal.any([
          this.abort.signal,
          AbortSignal.timeout(this.config.timeoutMs),
        ]);
        const url = urls[attempt % urls.length];
        const response = await fetch(url, { headers, signal });
        if (response.status === 404) {
          await response.body?.cancel();
          notFound.add(url);
          // A single CDN can lag behind. Only classify a missing resource
          // when every configured origin has actually returned 404.
          if (notFound.size === urls.length)
            return { response, bytes: undefined };
          continue;
        }
        if (response.status === 304) {
          await response.body?.cancel();
          if (!headers["If-None-Match"] && !headers["If-Modified-Since"])
            throw new Error("Unexpected upstream HTTP 304");
          if (canUseFallback)
            this.setting("preferredCdn", url === alternative ? fallback : "");
          return { response, bytes: undefined };
        }
        if (!response.ok) {
          await response.body?.cancel();
          const error = new Error(`Upstream HTTP ${response.status}`);
          error.noRetry = response.status < 500 && response.status !== 429;
          throw error;
        }
        const limit =
          asset.kind === "image" ? 10 * 1024 * 1024 : 64 * 1024 * 1024;
        const chunks = [];
        let size = 0;
        if (Number(response.headers.get("content-length")) > limit) {
          await response.body?.cancel();
          throw Object.assign(new Error("Resource exceeds size limit"), {
            noRetry: true,
          });
        }
        this.onProgress?.({
          type: "start",
          key: asset.key,
          kind: asset.kind,
          total: Math.max(
            0,
            Number(response.headers.get("content-length")) || 0,
          ),
          // A changed validator alone does not prove changed content.
          available: !this.has(asset.key),
        });
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > limit)
            throw Object.assign(new Error("Resource exceeds size limit"), {
              noRetry: true,
            });
          chunks.push(chunk);
          this.onProgress?.({
            type: "bytes",
            key: asset.key,
            bytes: chunk.length,
          });
        }
        const bytes = Buffer.concat(chunks);
        try {
          validate(bytes, asset.kind);
          if (
            asset.remote &&
            (response.headers.get("etag") !== asset.remote.etag ||
              size !== asset.remote.size)
          )
            throw new Error("Resource does not match S3 index ETag/size");
        } catch (error) {
          error.noRetry = !canUseFallback;
          throw error;
        }
        if (canUseFallback)
          this.setting("preferredCdn", url === alternative ? fallback : "");
        return { response, bytes };
      } catch (error) {
        lastError = error;
        if (error.noRetry || this.abort.signal.aborted) throw error;
        if (attempt === 0)
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelayMs ?? 300),
          );
      }
    }
    throw lastError;
  }
  async download(asset, priority, full = false) {
    await this.slots.acquire(priority);
    const temporary = path.join(this.work, randomUUID());
    try {
      const old = this.get(asset.key),
        local = this.has(asset.key),
        localHash =
          full && local
            ? createHash("sha256")
                .update(await readFile(this.file(asset.key)))
                .digest("hex")
            : old?.hash,
        headers = {
          "Accept-Encoding": "identity",
          "User-Agent": "NeosLocalResources/1.0",
        };
      if (
        local &&
        old?.url === asset.url &&
        localHash === old.hash &&
        (!asset.sha256 || old.hash === asset.sha256) &&
        (!asset.remote ||
          (old.etag === asset.remote.etag && old.size === asset.remote.size))
      ) {
        if (old.etag) headers["If-None-Match"] = old.etag;
        if (old.modified) headers["If-Modified-Since"] = old.modified;
      }
      const { response, bytes } = await this.readUpstream(asset, headers);
      if (response.status === 304 && local) {
        this.db
          .prepare("UPDATE resources SET checked=? WHERE key=?")
          .run(Date.now(), asset.key);
        return { changed: false };
      }
      if (response.status === 404) {
        if (local) {
          this.db
            .prepare("UPDATE resources SET checked=0 WHERE key=?")
            .run(asset.key);
          return { changed: false, stale: true };
        }
        this.db
          .prepare(
            "INSERT OR REPLACE INTO resources (key,url,hash,etag,size,checked,status) VALUES (?,?,?,?,?,?,404)",
          )
          .run(
            asset.key,
            asset.url,
            asset.sha256 || null,
            asset.remote?.etag || null,
            asset.remote?.size || 0,
            Date.now(),
          );
        throw new NotFound(asset.key);
      }
      const size = bytes.length;
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (asset.sha256 && hash !== asset.sha256)
        throw new Error("Resource does not match manifest SHA-256");
      const changed = !local || localHash !== hash;
      if (changed) {
        await writeFile(temporary, bytes);
        if (asset.kind === "database") {
          const db = new DatabaseSync(temporary, { readOnly: true });
          try {
            db.prepare("SELECT id FROM datas LIMIT 1").all();
            db.prepare("SELECT id FROM texts LIMIT 1").all();
            if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok")
              throw new Error("Corrupt card database");
          } finally {
            db.close();
          }
        }
        const destination = this.file(asset.key);
        mkdirSync(path.dirname(destination), { recursive: true });
        // Nginx validators use whole seconds and size: equal-size updates must change the timestamp.
        if (this.has(asset.key)) {
          const previousSecond = Math.floor(
            statSync(destination).mtimeMs / 1000,
          );
          const nextSecond = Math.max(
            Math.floor(Date.now() / 1000),
            previousSecond + 1,
          );
          await utimes(temporary, nextSecond, nextSecond);
        }
        await rename(temporary, destination);
      }
      this.db
        .prepare("INSERT OR REPLACE INTO resources VALUES (?,?,?,?,?,?,?,200)")
        .run(
          asset.key,
          asset.url,
          response.headers.get("etag"),
          response.headers.get("last-modified") ||
            (asset.remote
              ? new Date(asset.remote.modified).toUTCString()
              : null),
          hash,
          size,
          Date.now(),
        );
      if (changed) this.onProgress?.({ type: "changed", key: asset.key });
      return { changed };
    } catch (error) {
      if (this.has(asset.key) && !this.abort.signal.aborted) {
        // A failed forced check must not leave an older success looking fresh.
        this.db
          .prepare("UPDATE resources SET checked=0 WHERE key=?")
          .run(asset.key);
        return { changed: false, stale: true, error: error.message };
      }
      // An inconclusive check must not leave an old 404 suppressing retries.
      if (!(error instanceof NotFound))
        this.db
          .prepare("DELETE FROM resources WHERE key=? AND status=404")
          .run(asset.key);
      throw error;
    } finally {
      await rm(temporary, { force: true });
      this.onProgress?.({ type: "end", key: asset.key });
      this.slots.release();
    }
  }
  async close() {
    this.abort.abort();
    await Promise.allSettled([...this.inflight.values()]);
    this.db.close();
  }
}

export function sendFile(store, key, request, response) {
  const file = store.file(key),
    stat = statSync(file);
  const etag = `"${Math.floor(stat.mtimeMs / 1000).toString(
    16,
  )}-${stat.size.toString(16)}"`;
  const type = key.endsWith(".jpg")
    ? "image/jpeg"
    : key.endsWith(".ttf")
    ? "font/ttf"
    : key.endsWith(".json")
    ? "application/json"
    : key.endsWith(".cdb")
    ? "application/octet-stream"
    : "text/plain; charset=utf-8";
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("ETag", etag);
  response.setHeader("Last-Modified", stat.mtime.toUTCString());
  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304);
    response.end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
  });
  if (request.method === "HEAD") response.end();
  else
    createReadStream(file)
      .on("error", () => response.destroy())
      .pipe(response);
}
