import { proxy } from "valtio";

export interface ResourceStorageStatus {
  configured: boolean;
  directory: string;
  suggestedDirectory?: string;
  baseDirectory?: string;
  error?: string;
}

export const resourceStorage = proxy({
  status: undefined as ResourceStorageStatus | undefined,
  checking: false,
  saving: false,
  error: "",
  saveError: "",
});

export async function checkResourceStorage(): Promise<boolean> {
  resourceStorage.checking = true;
  resourceStorage.error = "";
  try {
    const response = await fetch("/api/resources/setup", {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    // Earlier servers have no first-run setup endpoint.
    if (response.status === 404) {
      resourceStorage.status = { configured: true, directory: "" };
      document.documentElement.dataset.resourceStorageReady = "true";
      return true;
    }
    if (!response.ok) throw new Error("Storage service unavailable");
    const status: ResourceStorageStatus = await response.json();
    if (typeof status.configured !== "boolean")
      throw new Error("Invalid storage status");
    resourceStorage.status = status;
    document.documentElement.dataset.resourceStorageReady = String(
      status.configured,
    );
    return status.configured;
  } catch {
    resourceStorage.error = "无法读取存储设置，请检查资源服务连接后重试。";
    return false;
  } finally {
    resourceStorage.checking = false;
  }
}

export async function saveResourceStorage(directory: string): Promise<boolean> {
  if (resourceStorage.saving) return false;
  resourceStorage.saving = true;
  resourceStorage.saveError = "";
  try {
    const response = await fetch("/api/resources/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directory: directory.trim() }),
      signal: AbortSignal.timeout(15_000),
    });
    const status = await response.json();
    if (!response.ok)
      throw new Error(status.error || "保存失败，请检查目录后重试。");
    if (status.configured !== true)
      throw new Error("存储设置未完成，请重新检查。");
    resourceStorage.status = status;
    document.documentElement.dataset.resourceStorageReady = "true";
    return true;
  } catch (error) {
    resourceStorage.saveError =
      error instanceof Error && error.name === "Error"
        ? error.message
        : "保存未能完成，请重新检查设置后重试。";
    return false;
  } finally {
    resourceStorage.saving = false;
  }
}
