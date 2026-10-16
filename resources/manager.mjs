import { existsSync } from "node:fs";

import { fontFiles, fontSources, localeFor } from "./config.mjs";
import { cardIds, NotFound, ResourceStore } from "./store.mjs";

export async function parallel(items, limit, run) {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const item = items[index++];
        await run(item);
      }
    }),
  );
}

export class ResourceManager {
  constructor(config) {
    this.config = config;
    this.store = new ResourceStore(config);
    this.core = new Map(config.core.map((asset) => [asset.key, asset]));
    this.images = new Map();
    this.catalogueVersion = "";
    this.progress = { total: 0, completed: 0, missing: 0, failed: 0 };
    this.errors = [];
    this.closed = false;
    this.buildCatalogue();
  }
  required(language) {
    const locale = localeFor(language);
    return [
      `ygopro-database/${locale}/cards.cdb`,
      `ygopro-database/${locale}/strings.conf`,
      "ygopro-super-pre/data/test-release.cdb",
      "ygopro-super-pre/data/test-release-v2.json",
      "ygopro-database/zh-CN/lflist.conf",
      "cn-database/env408-zh-CN/expansions/lflist.conf",
    ];
  }
  status(language) {
    const version = this.store.hash([...this.core.keys()]);
    return {
      ready: this.required(language).every((key) => this.store.has(key)),
      version,
      phase: this.coreTask
        ? "checking"
        : this.mirrorTask
        ? "mirroring"
        : "idle",
      checkedAt: Number(this.store.setting("checkedAt") || 0),
      completedAt: Number(this.store.setting("completedAt") || 0),
      files: this.store.counts(),
      progress: this.progress,
      warnings: this.errors,
    };
  }
  async check() {
    if (this.closed || this.config.offline) return;
    await this.checkCore();
    this.startMirror();
  }
  checkCore() {
    if (this.config.offline) return Promise.resolve();
    if (this.coreTask) return this.coreTask;
    this.coreTask = (async () => {
      this.errors = [];
      await parallel(
        this.config.core,
        this.config.concurrency,
        async (asset) => {
          try {
            const result = await this.store.update(asset, { priority: true });
            if (result.error || result.stale)
              this.errors.push(`${asset.key}: 使用已保存的版本`);
          } catch (error) {
            this.errors.push(`${asset.key}: 暂时无法更新`);
            console.warn("Resource check:", asset.key, error.message);
          }
        },
      );
      this.store.setting("checkedAt", Date.now());
      const version = this.store.hash([...this.core.keys()]);
      if (this.catalogueVersion !== version) {
        this.buildCatalogue();
        if (this.mirrorTask) this.rescan = true;
      }
    })().finally(() => {
      this.coreTask = undefined;
    });
    return this.coreTask;
  }
  buildCatalogue() {
    this.images.clear();
    const sources = this.config.sources;
    const ids = new Set();
    for (const locale of sources.languages) {
      const key = `ygopro-database/${locale}/cards.cdb`;
      if (this.store.has(key))
        for (const id of cardIds(this.store.file(key))) {
          if (Number.isSafeInteger(id) && id > 0) ids.add(id);
        }
    }
    const preKey = "ygopro-super-pre/data/test-release-v2.json";
    const pre = this.store.has(preKey)
      ? JSON.parse(this.store.read(preKey))
      : [];
    for (const { id } of pre) ids.delete(id);
    // A Japanese/Spanish database can contain a card absent from the English one.
    // Both image languages cover the union of all configured card databases.
    for (const locale of sources.imageLanguages) {
      const base = sources.releaseResource.img.replace("zh-CN", locale);
      for (const id of ids) {
        const key = `images/ygopro-images-${locale}/${id}.jpg`;
        this.images.set(key, { key, url: `${base}/${id}.jpg`, kind: "image" });
      }
    }
    for (const { id } of pre) {
      const key = `ygopro-super-pre/data/pics/${id}.jpg`;
      this.images.set(key, {
        key,
        url: `${sources.preReleaseResource.img}/${id}.jpg`,
        kind: "image",
      });
    }
    this.catalogueVersion = this.store.hash([...this.core.keys()]);
  }
  fonts() {
    const key = "fonts/source.css";
    return this.store.has(key)
      ? fontSources(this.store.read(key), this.config.sources.fontsCss)
      : [];
  }
  startMirror() {
    if (this.closed || this.mirrorTask) return;
    this.rescan = false;
    this.mirrorTask = (async () => {
      if (!this.images.size) this.buildCatalogue();
      let fonts = [];
      try {
        fonts = this.fonts();
      } catch (error) {
        this.errors.push("字体暂时无法更新");
        console.warn(error.message);
      }
      const assets = [...fonts, ...this.images.values()];
      this.progress = {
        total: assets.length,
        completed: 0,
        missing: 0,
        failed: 0,
      };
      let consecutiveFailures = 0,
        interrupted = false;
      await parallel(assets, this.config.concurrency, async (asset) => {
        if (this.closed || interrupted) return;
        try {
          const result = await this.store.update(asset);
          if (result.stale) {
            this.progress.failed++;
            consecutiveFailures++;
          } else consecutiveFailures = 0;
        } catch (error) {
          if (error instanceof NotFound) {
            this.progress.missing++;
            consecutiveFailures = 0;
          } else {
            this.progress.failed++;
            consecutiveFailures++;
          }
        } finally {
          this.progress.completed++;
          if (consecutiveFailures >= 12) interrupted = true;
          if (this.progress.completed % 500 === 0)
            console.info(
              `Resources: ${this.progress.completed}/${assets.length}, missing=${this.progress.missing}, failed=${this.progress.failed}`,
            );
        }
      });
      if (interrupted) this.errors.push("资源同步暂时中断，下次打开网页时继续");
      if (!this.closed && this.progress.failed === 0)
        this.store.setting("completedAt", Date.now());
      console.info(`Resource sync complete: ${JSON.stringify(this.progress)}`);
    })()
      .catch((error) => {
        console.error("Resource sync:", error.message);
      })
      .finally(() => {
        this.mirrorTask = undefined;
        if (this.rescan && !this.closed) this.startMirror();
      });
  }
  async ensure(key) {
    // Only configured files and actual card IDs can reach an upstream origin.
    let asset = this.core.get(key);
    if (asset?.kind === "css") throw new NotFound(key);
    if (!asset && fontFiles.some((font) => font.key === key)) {
      if (!this.store.has("fonts/source.css"))
        await this.store.update(this.core.get("fonts/source.css"), {
          priority: true,
        });
      asset = this.fonts().find((font) => font.key === key);
    }
    if (
      !asset &&
      /^(images\/ygopro-images-(zh-CN|en-US)|ygopro-super-pre\/data\/pics)\/[1-9]\d*\.jpg$/.test(
        key,
      )
    ) {
      if (!this.images.size) {
        await this.checkCore();
        this.buildCatalogue();
      }
      asset = this.images.get(key);
    }
    if (!asset) throw new NotFound(key);
    if (!existsSync(this.store.file(key)))
      await this.store.update(asset, { priority: true, cached: true });
    return key;
  }
  async close() {
    this.closed = true;
    this.store.abort.abort();
    await Promise.allSettled([this.coreTask, this.mirrorTask]);
    await this.store.close();
  }
}
