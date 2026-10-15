import { expect, test } from "@playwright/test";
import { mdpro3Fixture } from "./helpers/mdpro3Fixture";

test("hands stay level and both field halves keep equal card dimensions", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  const hands = await page
    .locator('[data-card-zone="HAND"][data-card-is-me="true"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return {
          top: r.top,
          height: r.height,
          width: r.width,
          matrix: getComputedStyle(node).transform,
        };
      }),
    );
  expect(
    Math.max(...hands.map((h) => h.top)) - Math.min(...hands.map((h) => h.top)),
  ).toBeLessThan(0.5);
  for (const card of hands) {
    const values = card.matrix
      .slice(card.matrix.indexOf("(") + 1, -1)
      .split(",")
      .map(Number);
    expect(values[1]).toBeCloseTo(0, 4);
  }
  const mine = (await page
    .locator('[data-card-uuid="p0-MZONE-2"] [data-card-face]')
    .boundingBox())!;
  const op = (await page
    .locator('[data-card-uuid="p1-MZONE-2"] [data-card-face]')
    .boundingBox())!;
  expect(mine.width).toBeCloseTo(op.width, 1);
  expect(mine.height).toBeCloseTo(op.height, 1);
  expect(
    await page
      .locator(".duel-mat-camera")
      .evaluate((node) => getComputedStyle(node).perspective),
  ).toBe("none");
  await page.screenshot({ path: test.info().outputPath("flat-duel.png") });
});

test("controls and their menus use viewport dimensions at desktop and portrait sizes", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  for (const size of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    const button = page.getByTestId("duel-settings");
    const box = (await button.boundingBox())!;
    expect(box.width).toBeCloseTo(44, 1);
    expect(box.height).toBeCloseTo(44, 1);
    await button.click();
    const menu = page.getByTestId("duel-settings-panel");
    await expect(menu).toBeVisible();
    expect((await menu.boundingBox())!.width).toBeCloseTo(280, 1);
    await page.getByTestId("duel-animation-quality").selectOption("lite");
    await page.screenshot({
      path: test.info().outputPath(`menu-${size.width}.png`),
    });
    await page.keyboard.press("Escape");
  }
});

test("summoning follows one monotonic path with no perspective resizing or late snap", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  const data = await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { animationSettings } = await import(
      "/src/ui/Duel/animation/runtime.ts"
    );
    const { callCardMove } = await import(
      "/src/ui/Duel/PlayMat/Card/index.tsx"
    );
    animationSettings.mode = "full";
    const card = cardStore.at(ygopro.CardZone.HAND, 0, 2)!;
    const node = document.querySelector(
      `[data-card-uuid="${card.uuid}"] [data-card-face]`,
    )!;
    const frames: { x: number; y: number; width: number; height: number }[] =
      [];
    let running = true;
    const sample = () => {
      const r = node.getBoundingClientRect();
      frames.push({ x: r.x, y: r.y, width: r.width, height: r.height });
      if (running) requestAnimationFrame(sample);
    };
    sample();
    card.location = new ygopro.CardLocation({
      controller: 0,
      zone: ygopro.CardZone.MZONE,
      sequence: 4,
      position: ygopro.CardPosition.FACEUP_ATTACK,
    });
    const movement = callCardMove(card.uuid, {
      fromZone: ygopro.CardZone.HAND,
    });
    setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    await movement;
    await new Promise((resolve) => setTimeout(resolve, 100));
    running = false;
    return frames;
  });
  expect(data.length).toBeGreaterThan(8);
  const widths = data.map((p) => p.width);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.5);
  for (let i = 1; i < data.length; i++) {
    expect(data[i].x - data[i - 1].x).toBeGreaterThanOrEqual(-0.5);
    expect(data[i].y - data[i - 1].y).toBeLessThanOrEqual(0.5);
  }
  const last = data.slice(-3);
  expect(
    Math.max(...last.map((p) => p.y)) - Math.min(...last.map((p) => p.y)),
  ).toBeLessThan(0.5);
});

test("popup fade keeps its anchor fixed and field view restores without submitting", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  const frames = await page.evaluate(async () => {
    const { displayYesNoModal } = await import(
      "/src/ui/Duel/Message/YesNoModal/index.tsx"
    );
    void displayYesNoModal("动画检查");
    const values: { x: number; y: number; width: number }[] = [];
    for (let i = 0; i < 16; i++) {
      await new Promise(requestAnimationFrame);
      const node = document.querySelector(
        '.ant-modal:not([style*="display: none"]) .ant-modal-content',
      );
      if (node) {
        const r = node.getBoundingClientRect();
        values.push({ x: r.x, y: r.y, width: r.width });
      }
    }
    return values;
  });
  expect(frames.length).toBeGreaterThan(8);
  for (const key of ["x", "y", "width"] as const)
    expect(
      Math.max(...frames.map((f) => f[key])) -
        Math.min(...frames.map((f) => f[key])),
    ).toBeLessThan(0.5);
  await page.keyboard.press("Escape");
  await page.mouse.click(640, 300, { button: "right" });
  await expect(page.getByTestId("duel-yesno-yes")).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
  await page.getByTestId("duel-yesno-yes").click();
});
