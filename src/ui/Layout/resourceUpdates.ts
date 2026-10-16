import { proxy } from "valtio";

export interface ResourceUpdate {
  id: string;
  phase: "checking" | "syncing" | "complete" | "partial";
  hasUpdates: boolean;
  core: { total: number; completed: number };
  assets: { total: number; completed: number };
  changed: number;
  downloadedBytes: number;
  failed: number;
  missing: number;
  active: { key: string; kind: string; received: number; total: number }[];
}

export const resourceUpdates = proxy({
  update: undefined as ResourceUpdate | undefined,
  connectionError: "",
  requesting: false,
  reloadAvailable: false,
});

let generation = 0;
let timer: number | undefined;
let pending: Promise<void> | undefined;

function receive(status: { update?: ResourceUpdate | null }) {
  const update = status.update;
  // Older resource services remain usable; they simply have no progress UI.
  if (!update) {
    if (resourceUpdates.update)
      resourceUpdates.connectionError = "更新状态已重置，请重新检查。";
    return false;
  }
  resourceUpdates.update = update;
  if (update.changed > 0) resourceUpdates.reloadAvailable = true;
  resourceUpdates.connectionError = "";
  return update.phase === "checking" || update.phase === "syncing";
}

function schedule(token: number, delay = 1000) {
  timer = window.setTimeout(() => void poll(token), delay);
}

async function poll(token: number) {
  try {
    const language = localStorage.getItem("language") || "cn";
    const job = resourceUpdates.update?.id;
    const response = await fetch(
      `/api/resources/status?language=${encodeURIComponent(language)}${
        job ? `&job=${encodeURIComponent(job)}` : ""
      }`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok)
      throw new Error(`Resource status HTTP ${response.status}`);
    const status = await response.json();
    if (token !== generation) return;
    if (receive(status)) schedule(token);
  } catch {
    if (token !== generation) return;
    resourceUpdates.connectionError =
      "进度连接暂时中断，正在重连。服务器会继续下载。";
    schedule(token, 5000);
  }
}

/** Check once during initialization; continue watching the shared server job in the background. */
export function checkResourceUpdates(): Promise<void> {
  if (pending) return pending;
  const token = ++generation;
  window.clearTimeout(timer);
  resourceUpdates.requesting = true;
  pending = (async () => {
    try {
      const language = localStorage.getItem("language") || "cn";
      const response = await fetch(
        `/api/resources/check?language=${encodeURIComponent(language)}`,
        {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok)
        throw new Error(`Resource service HTTP ${response.status}`);
      const status = await response.json();
      if (token === generation && receive(status)) schedule(token);
    } catch (error) {
      if (token === generation)
        resourceUpdates.connectionError = "无法连接资源服务，请稍后重试。";
      throw error;
    } finally {
      resourceUpdates.requesting = false;
      pending = undefined;
    }
  })();
  return pending;
}

window.addEventListener("pagehide", () => {
  generation++;
  window.clearTimeout(timer);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) void checkResourceUpdates().catch(() => undefined);
});
