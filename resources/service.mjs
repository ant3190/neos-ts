import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ResourceManager } from "./manager.mjs";

export class StorageSetupError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const project = fileURLToPath(new URL("../", import.meta.url));
const contains = (parent, child) => {
  const relative = path.relative(parent, child);
  return (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
};

// Resolve existing ancestors as well: a new directory may sit below a symlink.
async function canonical(directory) {
  try {
    return await realpath(directory);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = path.dirname(directory);
    if (parent === directory) throw error;
    return path.join(await canonical(parent), path.basename(directory));
  }
}

/** Only the small setup file is consulted before the user confirms a data directory. */
export class ResourceService {
  constructor(config) {
    this.config = config;
    this.settingsFile = path.join(config.configDir, "storage.json");
    this.suggestedDirectory = config.root;
    this.error = "";
    this.manager = undefined;
    this.closed = false;
    this.setupTask = Promise.resolve();
  }

  async initialize() {
    try {
      const settings = JSON.parse(await readFile(this.settingsFile, "utf8"));
      if (settings.version !== 1 || typeof settings.directory !== "string")
        throw new Error("Invalid storage settings");
      this.suggestedDirectory = settings.directory;
      const directory = await this.validateDirectory(settings.directory);
      this.manager = new ResourceManager({ ...this.config, root: directory });
      console.info(`Resource data directory: ${directory}`);
      this.startCheck();
    } catch (error) {
      if (error.code === "ENOENT") return;
      console.warn("Resource storage setup:", error.message);
      this.error = "无法打开已保存的数据目录，请检查路径和权限后重新确认。";
    }
  }

  storageStatus() {
    return {
      configured: Boolean(this.manager),
      directory: this.manager?.config.root || "",
      suggestedDirectory: this.suggestedDirectory,
      baseDirectory: this.config.storageBase || "",
      error: this.error,
    };
  }

  status(language, jobId) {
    return {
      ...(this.manager?.status(language, jobId) || {
        ready: false,
        phase: "setup",
        version: "",
        update: null,
      }),
      setupRequired: !this.manager,
      storage: this.storageStatus(),
    };
  }

  requireManager() {
    if (!this.manager)
      throw new StorageSetupError("请先在网页中设置数据存储目录。", 428);
    return this.manager;
  }

  get store() {
    return this.requireManager().store;
  }
  check() {
    return this.requireManager().check();
  }
  ensure(key) {
    return this.requireManager().ensure(key);
  }

  async validateDirectory(value) {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 4096 ||
      value.includes("\0") ||
      !path.isAbsolute(value.trim())
    )
      throw new StorageSetupError("请填写完整的绝对目录路径。");
    const directory = await canonical(path.resolve(value.trim()));
    if (
      directory === path.parse(directory).root ||
      contains(await canonical(project), directory)
    )
      throw new StorageSetupError("请选择项目目录之外的专用数据目录。");
    const configDir = await canonical(this.config.configDir);
    if (contains(directory, configDir) || contains(configDir, directory))
      throw new StorageSetupError("数据目录不能与服务配置目录重叠。");
    if (
      this.config.storageBase &&
      !contains(await canonical(this.config.storageBase), directory)
    )
      throw new StorageSetupError(
        `请选择 ${this.config.storageBase} 或其中的子目录。其他磁盘需要先挂载到资源服务。`,
      );
    return directory;
  }

  configure(value) {
    const next = this.setupTask
      .catch(() => undefined)
      .then(() => this.saveDirectory(value));
    this.setupTask = next;
    return next;
  }

  async saveDirectory(value) {
    if (this.closed)
      throw new StorageSetupError("服务正在关闭，请稍后重试。", 503);
    let directory;
    try {
      directory = await this.validateDirectory(value);
    } catch (error) {
      if (error instanceof StorageSetupError) throw error;
      throw new StorageSetupError("无法访问该目录，请检查路径和权限后重试。");
    }
    if (this.manager) {
      if (directory === this.manager.config.root) return this.storageStatus();
      throw new StorageSetupError(
        `数据目录已设置为 ${this.manager.config.root}，请重新检查以使用已保存的设置。`,
        409,
      );
    }
    let manager;
    const temporary = `${this.settingsFile}.${randomUUID()}.tmp`;
    try {
      await mkdir(directory, { recursive: true });
      const probe = path.join(directory, `.neos-write-check-${randomUUID()}`);
      await writeFile(probe, "", { flag: "wx", mode: 0o600 });
      await rm(probe);
      manager = new ResourceManager({ ...this.config, root: directory });
      await mkdir(this.config.configDir, { recursive: true });
      await writeFile(
        temporary,
        JSON.stringify({ version: 1, directory }) + "\n",
        { flag: "wx", mode: 0o600 },
      );
      await rename(temporary, this.settingsFile);
      this.manager = manager;
      this.suggestedDirectory = directory;
      this.error = "";
      console.info(`Resource data directory: ${directory}`);
      this.startCheck();
      return this.storageStatus();
    } catch (error) {
      if (manager) await manager.close();
      console.warn("Save resource storage:", error.message);
      throw new StorageSetupError(
        "无法创建或写入该目录，请检查路径、挂载和权限后重试。",
      );
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  startCheck() {
    if (this.config.autoSync)
      void this.manager
        .check()
        .catch((error) => console.error("Resource check:", error.message));
  }

  async close() {
    this.closed = true;
    await this.setupTask.catch(() => undefined);
    await this.manager?.close();
  }
}
