import { expect, type Page, test } from "@playwright/test";

import type { ResourceUpdate } from "../../src/ui/Layout/resourceUpdates";
import { installOfflineDuelResources } from "./helpers/offlineDuel";

const mb = 1024 * 1024;
function update(overrides: Partial<ResourceUpdate> = {}): ResourceUpdate {
  return {
    id: "update-1",
    phase: "syncing",
    hasUpdates: true,
    core: { total: 14, completed: 14 },
    assets: { total: 100, completed: 25 },
    changed: 3,
    downloadedBytes: 16 * mb,
    failed: 0,
    missing: 0,
    active: [],
    ...overrides,
  };
}
async function install(
  page: Page,
  check: () => ResourceUpdate | null,
  status = check,
) {
  await installOfflineDuelResources(page);
  let checks = 0,
    polls = 0;
  const queries: URLSearchParams[] = [];
  const response = (value: ResourceUpdate | null) => ({
    ready: true,
    phase: value?.phase === "complete" ? "idle" : "mirroring",
    version: "same-core-version",
    update: value,
  });
  await page.route("**/api/resources/check?*", (route) => {
    checks++;
    queries.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ status: 202, json: response(check()) });
  });
  await page.route("**/api/resources/status?*", (route) => {
    polls++;
    return route.fulfill({ json: response(status()) });
  });
  return { checks: () => checks, polls: () => polls, queries };
}

test("a check with no changed resources stays silent and stops polling", async ({
  page,
}) => {
  const traffic = await install(
    page,
    () => update({ phase: "checking", hasUpdates: false, changed: 0 }),
    () => update({ phase: "complete", hasUpdates: false, changed: 0 }),
  );
  await page.goto("/");
  await expect.poll(traffic.polls).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "查看资源更新进度" }),
  ).toHaveCount(0);
  await page.waitForTimeout(1300);
  expect(traffic.checks()).toBe(1);
  expect(traffic.polls()).toBe(1);
});

test("a later check from another page cannot hide the update this page joined", async ({
  page,
}) => {
  const id = "opening-update";
  await install(page, () =>
    update({ id, phase: "checking", hasUpdates: false, changed: 0 }),
  );
  await page.route("**/api/resources/status?*", (route) => {
    const ownJob =
      new URL(route.request().url()).searchParams.get("job") === id;
    return route.fulfill({
      json: {
        ready: true,
        phase: "idle",
        update: ownJob
          ? update({
              id,
              phase: "complete",
              assets: { total: 100, completed: 100 },
            })
          : update({
              id: "another-page",
              phase: "complete",
              hasUpdates: false,
              changed: 0,
            }),
      },
    });
  });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("资源更新完成");
  await expect(
    dialog.getByRole("button", { name: "刷新加载新数据" }),
  ).toBeVisible();
});

test("detects updates, shows live file progress, stays minimized, and refreshes only when requested", async ({
  page,
}) => {
  let current = update({
    phase: "checking",
    core: { total: 14, completed: 5 },
    downloadedBytes: 2 * mb,
    active: [
      {
        key: "ygopro-database/zh-CN/cards.cdb",
        kind: "database",
        received: mb,
        total: 8 * mb,
      },
    ],
  });
  let checks = 0;
  const traffic = await install(
    page,
    () =>
      ++checks === 1
        ? update({ phase: "checking", hasUpdates: false, changed: 0 })
        : update({ phase: "complete", hasUpdates: false, changed: 0 }),
    () => current,
  );
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("发现资源更新");
  await expect(dialog.getByTestId("resource-update-count")).toContainText(
    "5 / 14",
  );
  await expect(dialog.getByTestId("resource-update-bytes")).toHaveText(
    "2.0 MB",
  );
  await expect(dialog.getByTestId("resource-update-transfer")).toContainText(
    "正在下载卡库与效果文本",
  );
  await expect(dialog.getByTestId("resource-update-transfer")).toContainText(
    "1.0 MB / 8.0 MB",
  );

  current = update({
    assets: { total: 100, completed: 50 },
    active: [
      {
        key: "images/ygopro-images-zh-CN/46986414.jpg",
        kind: "image",
        received: 6 * mb,
        total: 8 * mb,
      },
    ],
  });
  await expect(dialog.getByTestId("resource-update-count")).toContainText(
    "50 / 100",
  );
  await expect(dialog.getByTestId("resource-update-transfer")).toContainText(
    "正在下载卡图",
  );
  await page.screenshot({ path: "/tmp/neos-update-modal-desktop.png" });
  const downloadingBox = await dialog.boundingBox();
  current = update({ assets: { total: 100, completed: 50 } });
  await expect(dialog.getByTestId("resource-update-transfer")).toContainText(
    "正在检查后续资源",
  );
  const checkingBox = await dialog.boundingBox();
  expect(checkingBox!.height).toBeCloseTo(downloadingBox!.height, 0);
  expect(checkingBox!.y).toBeCloseTo(downloadingBox!.y, 0);
  await dialog.getByRole("button", { name: "后台更新" }).click();
  await expect(dialog).toBeHidden();
  current = update({
    assets: { total: 100, completed: 75 },
    downloadedBytes: 24 * mb,
  });
  const reopen = page.getByRole("button", { name: "查看资源更新进度" });
  await expect(reopen).toContainText("75%");
  await expect(dialog).toBeHidden();
  await reopen.click();
  await expect(dialog.getByTestId("resource-update-count")).toContainText(
    "75 / 100",
  );
  current = update({
    phase: "complete",
    assets: { total: 100, completed: 100 },
    changed: 8,
    downloadedBytes: 32 * mb,
  });
  await expect(dialog).toContainText("资源更新完成");
  expect(traffic.checks()).toBe(1);
  await dialog.getByRole("button", { name: "刷新加载新数据" }).click();
  await expect.poll(traffic.checks).toBe(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a partial update can retry and still offers refresh when the retry finds everything current", async ({
  page,
}) => {
  let checks = 0;
  const traffic = await install(
    page,
    () =>
      ++checks === 1
        ? update({
            phase: "partial",
            failed: 3,
            assets: { total: 100, completed: 80 },
          })
        : update({
            id: "update-retry",
            phase: "checking",
            hasUpdates: false,
            changed: 0,
          }),
    () =>
      update({
        id: "update-retry",
        phase: "complete",
        hasUpdates: false,
        changed: 0,
        assets: { total: 100, completed: 100 },
      }),
  );
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("部分资源更新失败");
  await expect(dialog).toContainText("3 项资源未能更新");
  await dialog.getByRole("button", { name: "重试更新" }).click();
  await expect(dialog).toContainText("资源更新完成");
  await expect(
    dialog.getByRole("button", { name: "刷新加载新数据" }),
  ).toBeVisible();
  expect(checks).toBe(2);
  expect(traffic.queries[1].get("retry")).toBe("1");
  expect(traffic.queries[1].has("full")).toBe(false);
});

test("settings can run a full check and show completion even when nothing changed", async ({
  page,
}) => {
  let checks = 0;
  await page.addInitScript(() => localStorage.setItem("language", "cn"));
  const traffic = await install(page, () =>
    update({
      id: ++checks === 1 ? "quick" : "manual",
      phase: "complete",
      hasUpdates: false,
      changed: 0,
      downloadedBytes: 0,
      assets: { total: 0, completed: 0, cached: 32000 },
    }),
  );
  await page.goto("/");
  await expect.poll(traffic.checks).toBe(1);
  await page.locator("nav .ant-avatar").hover();
  await page.getByText("系统设置", { exact: true }).click();
  await page.getByRole("tab", { name: "资源" }).click();
  await page.getByRole("button", { name: "完整检查资源" }).click();
  await expect.poll(traffic.checks).toBe(2);
  expect(traffic.queries[1].get("full")).toBe("1");
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByTestId("resource-update-dialog") });
  await expect(dialog).toContainText("资源已是最新");
  await expect(dialog).toContainText("已复用 32,000 项本地资源");
  await expect(page.getByRole("tab", { name: "资源" })).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "刷新加载新数据" }),
  ).toHaveCount(0);
  await page.screenshot({ path: "/tmp/neos-full-check-complete.png" });
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看资源更新进度" }),
  ).toBeVisible();
});

test("lost progress connection keeps the last counts and can reconnect", async ({
  page,
}) => {
  let checks = 0;
  await install(page, () =>
    ++checks === 1
      ? update()
      : update({ phase: "complete", assets: { total: 100, completed: 100 } }),
  );
  await page.route("**/api/resources/status?*", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByTestId("resource-update-connection-error"),
  ).toContainText("正在重连");
  await expect(dialog.getByTestId("resource-update-count")).toContainText(
    "25 / 100",
  );
  await expect(
    dialog.getByRole("button", { name: "刷新加载新数据" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "重新检查" }).click();
  await expect(dialog).toContainText("资源更新完成");
  await expect(
    dialog.getByTestId("resource-update-connection-error"),
  ).toHaveCount(0);
  expect(checks).toBe(2);
});

test("update window stays readable and inside a narrow viewport with reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 680 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await install(page, () =>
    update({
      phase: "partial",
      failed: 30,
      missing: 1200,
      missingResources: Array.from({ length: 10 }, (_, i) => ({
        kind: "image",
        key: `images/ygopro-images-zh-CN/${46986414 + i}.jpg`,
      })),
      assets: { total: 32000, completed: 20000 },
    }),
  );
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(680);
  await expect(dialog.getByRole("button", { name: "重试更新" })).toBeVisible();
  await page.screenshot({ path: "/tmp/neos-update-modal-mobile.png" });
});

test("completed updates identify missing files and offer rechecking without hiding refresh", async ({
  page,
}) => {
  let checks = 0;
  await install(page, () =>
    ++checks === 1
      ? update({
          phase: "complete",
          missing: 1,
          assets: { total: 100, completed: 100 },
          missingResources: [
            { kind: "image", key: "images/ygopro-images-zh-CN/46986414.jpg" },
          ],
        })
      : update({
          id: "repaired",
          phase: "complete",
          assets: { total: 100, completed: 100 },
        }),
  );
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("资源同步完成，部分文件缺失");
  const missing = dialog.getByTestId("resource-update-missing");
  await expect(missing).toContainText("1 项资源暂未找到（404）");
  await expect(missing).toContainText("中文卡图 · 卡号 46986414");
  await expect(missing).toContainText(
    "images/ygopro-images-zh-CN/46986414.jpg",
  );
  await expect(
    dialog.getByRole("button", { name: "刷新加载新数据" }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/neos-update-missing-desktop.png" });
  await dialog.getByRole("button", { name: "重新检查", exact: true }).click();
  await expect(missing).toHaveCount(0);
  await expect(dialog).toContainText("资源更新完成");
  expect(checks).toBe(2);
});
