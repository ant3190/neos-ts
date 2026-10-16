import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const upstream = JSON.parse(
  readFileSync(
    process.env.NEOS_RESOURCE_SOURCES ||
      new URL("./upstream.json", import.meta.url),
    "utf8",
  ),
);
export const publicPrefix = "/local-resources/";
export const localeFor = (language = "cn") =>
  ({
    en: "en-US",
    br: "en-US",
    pt: "en-US",
    fr: "en-US",
    es: "es-ES",
    ja: "ja-JP",
    ko: "ko-KR",
  })[language] || (upstream.languages.includes(language) ? language : "zh-CN");

export function makeConfig(overrides = {}) {
  const root =
    overrides.root ||
    process.env.NEOS_RESOURCE_DIR?.trim() ||
    process.env.NEOS_RESOURCE_DATA_DIR?.trim() ||
    fileURLToPath(new URL("../../neos-data", import.meta.url));
  const sources = overrides.sources || upstream;
  const core = [];
  for (const locale of sources.languages) {
    core.push({
      key: `ygopro-database/${locale}/cards.cdb`,
      url: sources.releaseResource.cdb.replace("zh-CN", locale),
      kind: "database",
    });
    core.push({
      key: `ygopro-database/${locale}/strings.conf`,
      url: sources.stringsUrl.replace("zh-CN", locale),
      kind: "strings",
    });
  }
  core.push(
    {
      key: "ygopro-database/zh-CN/lflist.conf",
      url: sources.releaseResource.lflist,
      kind: "banlist",
    },
    {
      key: "cn-database/env408-zh-CN/expansions/lflist.conf",
      url: sources.env408Resource.lflist,
      kind: "banlist",
    },
    {
      key: "ygopro-super-pre/data/test-release.cdb",
      url: sources.preReleaseResource.cdb,
      kind: "database",
    },
    {
      key: "ygopro-super-pre/data/test-release-v2.json",
      url: sources.preReleaseResource.config,
      kind: "prerelease",
    },
    { key: "fonts/source.css", url: sources.fontsCss, kind: "css" },
  );
  return {
    root: path.resolve(root),
    configDir: path.resolve(
      process.env.NEOS_RESOURCE_CONFIG_DIR ||
        fileURLToPath(new URL("../../neos-config", import.meta.url)),
    ),
    storageBase: process.env.NEOS_RESOURCE_STORAGE_BASE || "",
    host: process.env.NEOS_RESOURCE_HOST || "0.0.0.0",
    port: Number(process.env.NEOS_RESOURCE_PORT || 8788),
    concurrency: Math.max(
      1,
      Math.min(16, Number(process.env.NEOS_RESOURCE_CONCURRENCY) || 6),
    ),
    timeoutMs: 30_000,
    sources,
    core,
    autoSync: process.env.NEOS_RESOURCE_AUTO_SYNC !== "0",
    offline: process.env.NEOS_RESOURCE_OFFLINE === "1",
    ...overrides,
  };
}

export const fontFiles = [
  { name: "Electrolize", key: "fonts/Electrolize.ttf" },
  { name: "Noto Serif SC", key: "fonts/NotoSerifSC-Bold.ttf" },
];

export function fontSources(css, base) {
  return fontFiles.map((font) => {
    const block = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].find(
      (match) =>
        match[1].includes(`'${font.name}'`) ||
        match[1].includes(`"${font.name}"`),
    );
    const source = block?.[1].match(/url\(\s*['"]?([^)'"\s]+)/)?.[1];
    if (!source) throw new Error(`Font source missing: ${font.name}`);
    const url = new URL(source, base).href;
    if (
      !url.startsWith("https://fonts.gstatic.font.im/") &&
      new URL(url).origin !== new URL(base).origin
    )
      throw new Error("Unexpected font origin");
    return { ...font, url, kind: "font" };
  });
}
