import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { rename, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export class NotFound extends Error {}

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
  async update(asset, { priority = false, cached = false } = {}) {
    const existing = this.inflight.get(asset.key);
    if (existing) return existing;
    if (cached && this.has(asset.key)) return { changed: false, cached: true };
    const previous = this.get(asset.key);
    if (
      cached &&
      previous?.status === 404 &&
      Date.now() - previous.checked < 3600_000
    )
      throw new NotFound(asset.key);
    const task = this.download(asset, priority).finally(() =>
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
  async download(asset, priority) {
    await this.slots.acquire(priority);
    const temporary = path.join(this.work, randomUUID());
    try {
      const old = this.get(asset.key),
        local = this.has(asset.key),
        headers = {
          "Accept-Encoding": "identity",
          "User-Agent": "NeosLocalResources/1.0",
        };
      if (local && old?.url === asset.url) {
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
        if (local) return { changed: false, stale: true };
        this.db
          .prepare(
            "INSERT OR REPLACE INTO resources (key,url,checked,status) VALUES (?,?,?,404)",
          )
          .run(asset.key, asset.url, Date.now());
        throw new NotFound(asset.key);
      }
      const size = bytes.length;
      const hash = createHash("sha256").update(bytes).digest("hex");
      const changed = !local || old?.hash !== hash;
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
          response.headers.get("last-modified"),
          hash,
          size,
          Date.now(),
        );
      if (changed) this.onProgress?.({ type: "changed", key: asset.key });
      return { changed };
    } catch (error) {
      if (this.has(asset.key) && !this.abort.signal.aborted)
        return { changed: false, stale: true, error: error.message };
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
