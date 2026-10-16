import { expect, test } from "@playwright/test";

import { installOfflineDuelResources } from "./helpers/offlineDuel";

test("each page load checks updates and all card data and images use the local origin", async ({
  page,
}) => {
  await installOfflineDuelResources(page);
  const checks: string[] = [],
    assets: string[] = [],
    setups: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/resources/check"))
      checks.push(request.method());
    if (request.url().includes("/api/resources/setup"))
      setups.push(request.method());
    if (/\.(cdb|conf|ttf|jpg)(\?|$)|test-release-v2\.json/.test(request.url()))
      assets.push(request.url());
  });
  await page.goto("/");
  await page.waitForFunction(
    async () =>
      (await import("/src/stores/index.ts")).initStore.resources.ready,
  );
  expect(checks).toEqual(["POST"]);
  await expect(page.getByTestId("local-resource-error")).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(
    async () =>
      (await import("/src/stores/index.ts")).initStore.resources.ready,
  );
  expect(checks).toEqual(["POST", "POST"]);
  expect(setups).toEqual([]);
  await expect(page.getByTestId("resource-storage-setup")).toHaveCount(0);
  const origin = new URL(page.url()).origin;
  expect(assets.length).toBeGreaterThan(5);
  expect(assets.every((url) => new URL(url).origin === origin)).toBe(true);
  expect(
    assets.some((url) =>
      url.includes("/local-resources/ygopro-database/zh-CN/cards.cdb"),
    ),
  ).toBe(true);
});

test("failed local initialization shows retry and recovers without a page reload", async ({
  page,
}) => {
  await installOfflineDuelResources(page);
  let unavailable = true;
  await page.route(/\.cdb(?:\?.*)?$/, (route) =>
    unavailable
      ? route.fulfill({ status: 503, body: "temporarily unavailable" })
      : route.fallback(),
  );
  await page.goto("/");
  const error = page.getByTestId("local-resource-error");
  await expect(error).toBeVisible();
  await expect(page.getByTestId("local-resource-loading")).toContainText(
    "等待重试",
  );
  unavailable = false;
  await error.getByRole("button", { name: "重试" }).click();
  await page.waitForFunction(
    async () =>
      (await import("/src/stores/index.ts")).initStore.resources.ready,
  );
  await expect(error).toHaveCount(0);
  await expect(page.getByTestId("local-resource-loading")).toHaveCount(0);
});
