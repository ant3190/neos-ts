import { expect, type Page, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { installOfflineDuelResources } from "./helpers/offlineDuel";

test("webpage saves the directory through the actual service and restores it after a service restart", async ({
  page,
}) => {
  const { makeConfig } = await import("../../resources/config.mjs");
  const { startResources } = await import("../../resources/server.mjs");
  const parent = await mkdtemp(path.join(os.tmpdir(), "neos-ui-storage-"));
  const directory = path.join(parent, "cards");
  const config = makeConfig({
    root: directory,
    configDir: path.join(parent, "config"),
    storageBase: "",
    host: "127.0.0.1",
    port: 0,
    autoSync: false,
    offline: true,
  });
  let app = await startResources(config);
  let origin = `http://127.0.0.1:${app.server.address().port}`;
  try {
    await installOfflineDuelResources(page);
    await page.route("**/api/resources/setup", async (route) => {
      const incoming = route.request();
      const response = await fetch(
        origin + "/api/resources/setup",
        incoming.method() === "POST"
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: incoming.postData(),
            }
          : undefined,
      );
      return route.fulfill({
        status: response.status,
        json: await response.json(),
      });
    });
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "首次设置 · 数据存储" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("数据存储目录")).toHaveValue(directory);
    await page.screenshot({ path: "/tmp/neos-first-run-desktop.png" });
    await dialog.getByRole("button", { name: "保存并开始下载" }).click();
    await page.waitForFunction(
      async () =>
        (await import("/src/stores/index.ts")).initStore.resources.ready,
    );
    const saved = JSON.parse(
      await readFile(path.join(config.configDir, "storage.json"), "utf8"),
    );
    expect(saved.directory).toBe(directory);
    await app.close();
    app = await startResources(config);
    origin = `http://127.0.0.1:${app.server.address().port}`;
    await page.reload();
    await page.waitForFunction(
      async () =>
        (await import("/src/stores/index.ts")).initStore.resources.ready,
    );
    await expect(dialog).toHaveCount(0);
  } finally {
    await app.close();
    await rm(parent, { recursive: true, force: true });
  }
});

async function storage(page: Page) {
  await installOfflineDuelResources(page);
  const state = {
    directory: "",
    failSave: false,
    unavailable: false,
    saves: [] as string[],
    checks: 0,
  };
  await page.route("**/api/resources/setup", async (route) => {
    if (state.unavailable)
      return route.fulfill({ status: 503, json: { error: "unavailable" } });
    if (route.request().method() === "POST") {
      state.saves.push(route.request().postDataJSON().directory);
      if (state.failSave)
        return route.fulfill({
          status: 400,
          json: { error: "无法写入该目录，请选择可用的存储位置。" },
        });
      state.directory = state.saves[state.saves.length - 1];
    }
    return route.fulfill({
      json: {
        configured: Boolean(state.directory),
        directory: state.directory,
        suggestedDirectory: "/data",
        baseDirectory: "/data",
      },
    });
  });
  await page.route("**/api/resources/check?*", (route) => {
    state.checks++;
    return route.fulfill({
      status: 202,
      json: {
        ready: true,
        phase: "mirroring",
        update: {
          id: "first-download",
          phase: "syncing",
          hasUpdates: true,
          core: { total: 14, completed: 14 },
          assets: { total: 100, completed: 25 },
          changed: 4,
          downloadedBytes: 1024 * 1024,
          failed: 0,
          missing: 0,
          active: [],
        },
      },
    });
  });
  await page.route("**/api/resources/status?*", (route) =>
    route.fulfill({
      json: {
        ready: true,
        phase: "idle",
        update: {
          id: "first-download",
          phase: "complete",
          hasUpdates: true,
          core: { total: 14, completed: 14 },
          assets: { total: 100, completed: 100 },
          changed: 4,
          downloadedBytes: 4 * 1024 * 1024,
          failed: 0,
          missing: 0,
          active: [],
        },
      },
    }),
  );
  return state;
}

test("first visit waits for a directory, continues into progress, and reuses the setting on reload", async ({
  page,
}) => {
  const state = await storage(page);
  const assets: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/local-resources/")) assets.push(request.url());
  });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "首次设置 · 数据存储" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("数据存储目录")).toHaveValue("/data");
  expect(state.checks).toBe(0);
  expect(assets).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("数据存储目录").fill("/data/卡片数据");
  await dialog.getByRole("button", { name: "保存并开始下载" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("resource-update-dialog")).toBeVisible();
  await page.waitForFunction(
    async () =>
      (await import("/src/stores/index.ts")).initStore.resources.ready,
  );
  expect(state.saves).toEqual(["/data/卡片数据"]);
  expect(state.checks).toBe(1);
  expect(assets.length).toBeGreaterThan(0);
  await page.reload();
  await page.waitForFunction(
    async () =>
      (await import("/src/stores/index.ts")).initStore.resources.ready,
  );
  await expect(dialog).toHaveCount(0);
  expect(state.saves).toHaveLength(1);
  expect(state.checks).toBe(2);
});

test("invalid input and save errors preserve the directory and do not start downloads", async ({
  page,
}) => {
  const state = await storage(page);
  state.failSave = true;
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "首次设置 · 数据存储" });
  const input = dialog.getByLabel("数据存储目录");
  await input.fill(" ");
  await dialog.getByRole("button", { name: "保存并开始下载" }).click();
  await expect(dialog).toContainText("请填写数据存储目录。");
  expect(state.saves).toHaveLength(0);
  await input.fill("/data/my-cards");
  await input.press("Enter");
  await expect(page.getByTestId("resource-storage-error")).toContainText(
    "无法写入该目录",
  );
  await expect(input).toHaveValue("/data/my-cards");
  expect(state.checks).toBe(0);
  await expect(page.getByTestId("local-resource-error")).toHaveCount(0);
  state.failSave = false;
  await dialog.getByRole("button", { name: "保存并开始下载" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => state.checks).toBe(1);
});

test("a lost setup connection can be retried before loading resources", async ({
  page,
}) => {
  const state = await storage(page);
  state.unavailable = true;
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "首次设置 · 数据存储" });
  await expect(dialog).toContainText("无法读取存储设置");
  expect(state.checks).toBe(0);
  state.unavailable = false;
  await dialog.getByRole("button", { name: "重新连接" }).click();
  await expect(dialog.getByLabel("数据存储目录")).toHaveValue("/data");
  expect(state.checks).toBe(0);
});

test("setup remains readable and keyboard operable on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await storage(page);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "首次设置 · 数据存储" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByLabel("数据存储目录");
  await expect(input).toBeFocused();
  await input.fill("/data/" + "long-directory-".repeat(8));
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  const button = dialog.getByRole("button", { name: "保存并开始下载" });
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await page.screenshot({ path: "/tmp/neos-first-run-mobile.png" });
});
