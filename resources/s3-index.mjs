import path from "node:path";
import { SaxesParser } from "saxes";

const namespace = "http://s3.amazonaws.com/doc/2006-03-01/";
const pageLimit = 4 * 1024 * 1024;

/** Parse real S3 XML, including numeric entities and URL-encoded object keys. */
export function parseS3Page(xml, prefix) {
  const parser = new SaxesParser({ xmlns: true });
  const stack = [],
    rows = [],
    meta = {};
  let current,
    directories = 0;
  const put = (target, name, value) => {
    if (Object.hasOwn(target, name))
      throw new Error("Duplicate S3 index field");
    target[name] = value;
  };
  parser.on("doctype", () => {
    throw new Error("Unexpected S3 index DOCTYPE");
  });
  parser.on("opentag", (node) => {
    if (
      !stack.length &&
      (node.local !== "ListBucketResult" || node.uri !== namespace)
    )
      throw new Error("Invalid S3 index response");
    if (stack.length === 1 && node.local === "Contents") current = {};
    if (stack.length === 1 && node.local === "CommonPrefixes") directories++;
    if (stack.length > 8) throw new Error("Invalid S3 index nesting");
    stack.push({ name: node.local, text: "" });
  });
  const text = (value) => {
    if (stack.length) stack.at(-1).text += value;
  };
  parser.on("text", text);
  parser.on("cdata", text);
  parser.on("closetag", () => {
    const node = stack.pop();
    if (
      stack.length === 2 &&
      stack[1].name === "Contents" &&
      ["Key", "ETag", "Size", "LastModified"].includes(node.name)
    )
      put(current, node.name, node.text);
    else if (stack.length === 1 && node.name === "Contents") rows.push(current);
    else if (
      stack.length === 1 &&
      [
        "Prefix",
        "IsTruncated",
        "NextContinuationToken",
        "EncodingType",
        "KeyCount",
      ].includes(node.name)
    )
      put(meta, node.name, node.text);
  });
  parser.write(xml).close();
  const decode = (value) =>
    meta.EncodingType === "url" ? decodeURIComponent(value) : value;
  if (
    decode(meta.Prefix || "") !== prefix ||
    !["true", "false"].includes(meta.IsTruncated) ||
    !/^\d+$/.test(meta.KeyCount || "") ||
    Number(meta.KeyCount) !== rows.length + directories ||
    rows.length > 1000 ||
    (meta.IsTruncated === "true" &&
      (!meta.NextContinuationToken || Number(meta.KeyCount) === 0))
  )
    throw new Error("Incomplete S3 index page");
  const entries = new Map();
  for (const row of rows) {
    const key = decode(row.Key || "");
    const size = Number(row.Size);
    if (
      !key ||
      !key.startsWith(prefix) ||
      key.includes("\0") ||
      !/^"[^"\r\n]{1,256}"$/.test(row.ETag || "") ||
      !/^\d+$/.test(row.Size || "") ||
      !Number.isSafeInteger(size) ||
      !Number.isFinite(Date.parse(row.LastModified)) ||
      entries.has(key)
    )
      throw new Error("Invalid S3 object metadata");
    entries.set(key, { etag: row.ETag, size, modified: row.LastModified });
  }
  return {
    entries,
    next: meta.IsTruncated === "true" ? meta.NextContinuationToken : null,
  };
}

export class S3Index {
  constructor(config, store) {
    this.config = config;
    this.store = store;
    this.available = new Map();
    this.checkedScopes = new Set();
    this.base = config.s3IndexUrl ? new URL(config.s3IndexUrl) : null;
    if (this.base && !["https:", "http:"].includes(this.base.protocol))
      throw new Error("NEOS_RESOURCE_S3_INDEX_URL 必须是 HTTP(S) 地址");
    this.store.db.exec(
      "CREATE TABLE IF NOT EXISTS resource_indexes (scope TEXT PRIMARY KEY, checked INTEGER NOT NULL, entries TEXT NOT NULL, failed INTEGER NOT NULL DEFAULT 0)",
    );
  }
  begin() {
    this.available.clear();
    this.checkedScopes.clear();
  }
  scope(asset) {
    if (!this.base) return null;
    const url = new URL(asset.url);
    if (
      url.search ||
      (url.origin !== this.base.origin && url.hostname !== "cdn02.moecube.com")
    )
      return null;
    const key = decodeURIComponent(url.pathname.slice(1));
    const directory = path.posix.dirname(key);
    const prefix = directory === "." ? "" : `${directory}/`;
    return { key, prefix, id: JSON.stringify([this.base.href, prefix]) };
  }
  metadata(asset) {
    const scope = this.scope(asset);
    return scope ? this.available.get(scope.id)?.get(scope.key) : undefined;
  }
  async page(prefix, token) {
    const url = new URL(this.base);
    url.search = new URLSearchParams({
      "list-type": "2",
      prefix,
      delimiter: "/",
      "encoding-type": "url",
      "max-keys": String(this.config.s3PageSize || 1000),
      ...(token ? { "continuation-token": token } : {}),
    }).toString();
    const response = await fetch(url, {
      headers: { "User-Agent": "NeosLocalResources/1.0" },
      cache: "no-store",
      signal: AbortSignal.any([
        this.store.abort.signal,
        AbortSignal.timeout(this.config.timeoutMs),
      ]),
    });
    try {
      if (!response.ok) throw new Error(`S3 index HTTP ${response.status}`);
      if (Number(response.headers.get("content-length")) > pageLimit)
        throw new Error("S3 index page exceeds size limit");
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > pageLimit)
          throw new Error("S3 index page exceeds size limit");
        chunks.push(chunk);
      }
      return {
        ...parseS3Page(Buffer.concat(chunks).toString("utf8"), prefix),
        bytes: size,
      };
    } finally {
      if (!response.bodyUsed) await response.body?.cancel();
    }
  }
  async load(scope, { force = false, onPage = () => {} } = {}) {
    this.available.delete(scope.id);
    const previous = this.store.db
      .prepare("SELECT * FROM resource_indexes WHERE scope=?")
      .get(scope.id);
    const now = Date.now();
    if (
      !force &&
      previous?.failed &&
      now >= previous.failed &&
      now - previous.failed < 60_000
    )
      throw new Error("S3 index is temporarily unavailable; retry later");
    if (
      !force &&
      previous &&
      !previous.failed &&
      now >= previous.checked &&
      now - previous.checked < this.config.coreMaxAgeMs
    ) {
      try {
        const entries = new Map(JSON.parse(previous.entries));
        this.available.set(scope.id, entries);
        return { cached: true };
      } catch {
        /* Replace a damaged cache from the upstream. */
      }
    }
    try {
      const entries = new Map(),
        tokens = new Set();
      let token;
      do {
        const page = await this.page(scope.prefix, token);
        onPage();
        for (const [key, entry] of page.entries) {
          if (entries.has(key))
            throw new Error("Duplicate S3 object across pages");
          entries.set(key, entry);
        }
        if (entries.size > 200_000 || tokens.size > 1000)
          throw new Error("S3 index exceeds size limit");
        token = page.next;
        if (token && tokens.has(token))
          throw new Error("Repeated S3 continuation token");
        if (token) tokens.add(token);
      } while (token);
      // No partial pages become usable or overwrite a previously complete snapshot.
      this.store.db
        .prepare("INSERT OR REPLACE INTO resource_indexes VALUES (?,?,?,0)")
        .run(scope.id, Date.now(), JSON.stringify([...entries]));
      this.available.set(scope.id, entries);
      return { cached: false };
    } catch (error) {
      if (!this.store.abort.signal.aborted)
        this.store.db
          .prepare(
            "INSERT INTO resource_indexes VALUES (?,0,'[]',?) ON CONFLICT(scope) DO UPDATE SET failed=excluded.failed",
          )
          .run(scope.id, Date.now());
      throw error;
    }
  }
  async refresh(assets, { force = false, onProgress = () => {} } = {}) {
    const groups = new Map();
    for (const asset of assets) {
      const scope = this.scope(asset);
      if (scope && !this.checkedScopes.has(scope.id))
        groups.set(scope.id, scope);
    }
    const warnings = [];
    onProgress({ type: "start", total: groups.size });
    let index = 0;
    const scopes = [...groups.values()];
    await Promise.all(
      Array.from(
        { length: Math.min(3, this.config.concurrency, scopes.length) },
        async () => {
          while (index < scopes.length) {
            const scope = scopes[index++];
            this.checkedScopes.add(scope.id);
            try {
              const result = await this.load(scope, {
                force,
                onPage: () => onProgress({ type: "page" }),
              });
              onProgress({ type: "complete", cached: result.cached });
            } catch (error) {
              warnings.push(
                `${scope.prefix || "/"}: 索引暂时不可用，已回退逐项检查`,
              );
              console.warn(
                "Resource index:",
                scope.prefix || "/",
                error.message,
              );
              onProgress({ type: "complete", failed: true });
            }
          }
        },
      ),
    );
    onProgress({ type: "end" });
    return warnings;
  }
}
