import { expect, type Page, test } from "@playwright/test";

import { mdpro3Fixture } from "./helpers/mdpro3Fixture";

async function beginSum(page: Page, zone = "MZONE", overflow = false) {
  await page.evaluate(
    async ({ zone, overflow }) => {
      const { getUIContainer } = await import("/src/container/compat.ts");
      const { ygopro } = await import("/src/api/index.ts");
      const { default: selectSum } = await import(
        "/src/service/duel/selectSum.ts"
      );
      const info = (sequence: number, response: number, level1: number) =>
        new ygopro.StocGameMessage.MsgSelectSum.Info({
          code: 46986414,
          location: new ygopro.CardLocation({
            controller: 0,
            zone:
              zone === "OVERLAY"
                ? ygopro.CardZone.MZONE
                : ygopro.CardZone[zone],
            sequence,
            is_overlay: zone === "OVERLAY",
            overlay_sequence: 0,
          }),
          response,
          level1,
          level2: level1,
        });
      void selectSum(
        getUIContainer(),
        new ygopro.StocGameMessage.MsgSelectSum({
          player: 0,
          level_sum: 8,
          min: 1,
          max: 2,
          overflow: overflow ? 1 : 0,
          must_select_cards: [info(0, 4, 3)],
          selectable_cards: [info(1, 7, 5), info(2, 9, 2)],
        }),
      );
    },
    { zone, overflow },
  );
}

async function beginIncremental(
  page: Page,
  options: {
    zone?: string;
    finishable?: boolean;
    cancelable?: boolean;
  } = {},
) {
  await page.evaluate(
    async ({ zone = "MZONE", finishable = false, cancelable = false }) => {
      const { getUIContainer } = await import("/src/container/compat.ts");
      const { ygopro } = await import("/src/api/index.ts");
      const { default: selectUnselect } = await import(
        "/src/service/duel/selectUnselectCard.ts"
      );
      const info = (sequence: number, response: number) =>
        new ygopro.StocGameMessage.MsgSelectUnselectCard.Info({
          code: 46986414,
          location: new ygopro.CardLocation({
            controller: 0,
            zone: ygopro.CardZone[zone],
            sequence,
          }),
          response,
        });
      void selectUnselect(
        getUIContainer(),
        new ygopro.StocGameMessage.MsgSelectUnselectCard({
          player: 0,
          min: 1,
          max: 3,
          finishable,
          cancelable,
          selectable_cards: [info(1, 11), info(2, 13)],
          selected_cards: [info(0, 6)],
        }),
      );
    },
    options,
  );
}

async function expectPacket(page: Page, response: number[] | number | boolean) {
  await expect
    .poll(() => page.evaluate(() => (window as any).__parityPackets.length))
    .toBe(1);
  const packets = await page.evaluate(async (response) => {
    const {
      sendSelectMultiResponse,
      sendSelectSingleResponse,
      sendSelectEffectYnResponse,
    } = await import("/src/api/index.ts");
    const expected: number[][] = [];
    const conn = {
      ws: { send: (bytes: Uint8Array) => expected.push([...bytes]) },
    } as any;
    if (Array.isArray(response)) sendSelectMultiResponse(conn, response);
    else if (typeof response === "boolean")
      sendSelectEffectYnResponse(conn, response);
    else sendSelectSingleResponse(conn, response);
    return { expected, actual: (window as any).__parityPackets };
  }, response);
  expect(packets.actual).toEqual(packets.expected);
}

test("on-field exact-level materials select directly and submit once with mandatory responses", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await beginSum(page);
  await expect(page.getByTestId("duel-field-selection")).toBeVisible();
  await expect(page.getByTestId("duel-select-cards-modal")).toHaveCount(0);
  await expect(page.locator('[data-card-uuid="p0-MZONE-0"]')).toHaveAttribute(
    "data-card-selected",
    "true",
  );
  await expect(page.getByTestId("duel-select-card-submit")).toBeDisabled();
  await page.mouse.click(640, 300, { button: "right" });
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
  await page.locator('[data-card-uuid="p0-MZONE-1"]').click();
  await expectPacket(page, [4, 7]);
  await expect(page.getByTestId("duel-field-selection")).toHaveCount(0);
  await expect(page.locator('[data-card-selected="true"]')).toHaveCount(0);
});

for (const zone of ["HAND", "GRAVE", "OVERLAY"]) {
  test(`${zone} sum materials use the popup and preserve protocol indices`, async ({
    page,
  }) => {
    await mdpro3Fixture(page);
    await beginSum(page, zone);
    await expect(page.getByTestId("duel-select-cards-modal")).toBeVisible();
    await expect(page.getByTestId("duel-field-selection")).toHaveCount(0);
    // Forced requests permit field view without sending a cancel response.
    await page.mouse.click(640, 300, { button: "right" });
    expect(
      await page.evaluate(() => (window as any).__parityPackets.length),
    ).toBe(0);
    await page.mouse.click(640, 300, { button: "right" });
    await page
      .getByTestId("duel-select-candidates")
      .locator('[data-card-response="7"]')
      .click();
    await page.getByTestId("duel-select-card-submit").click();
    await expectPacket(page, [4, 7]);
  });
}

test("overflow materials keep a compact confirmation dock at desktop and portrait scales", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await beginSum(page, "MZONE", true);
  await page.locator('[data-card-uuid="p0-MZONE-1"]').click();
  const submit = page.getByTestId("duel-select-card-submit");
  await expect(submit).toBeEnabled();
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
  for (const size of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () => (await submit.boundingBox())!.height)
      .toBeCloseTo(44, 1);
    const box = (await submit.boundingBox())!;
    expect(box.height).toBeCloseTo(44, 1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(
      await submit.evaluate((node) => getComputedStyle(node).borderRadius),
    ).toBe("4px");
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({
    path: test.info().outputPath("material-confirmation.png"),
  });
  await submit.click();
  await expectPacket(page, [4, 7]);
});

test("incremental selections respect forced, cancelable and finishable engine states", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await beginIncremental(page);
  await expect(page.getByTestId("duel-material-confirm")).toBeDisabled();
  await page.mouse.click(640, 300, { button: "right" });
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
  await page.locator('[data-card-uuid="p0-MZONE-0"]').click();
  await expectPacket(page, [6]);
  await expect(page.getByTestId("duel-material-controls")).toHaveCount(0);
  await page.evaluate(() => (window as any).__parityPackets.splice(0));
  await beginIncremental(page, { cancelable: true });
  await expect(page.getByTestId("duel-material-cancel")).toBeVisible();
  await page.mouse.click(640, 300, { button: "right" });
  await page.mouse.click(640, 300, { button: "right" });
  await expectPacket(page, -1);
  await page.evaluate(() => (window as any).__parityPackets.splice(0));
  await beginIncremental(page, { finishable: true });
  await expect(page.getByTestId("duel-material-confirm")).toBeEnabled();
  await page.getByTestId("duel-material-confirm").click();
  await expectPacket(page, -1);
});

test("incremental hand materials use the popup and right click finishes only when allowed", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await beginIncremental(page, { zone: "HAND", finishable: true });
  await expect(page.getByTestId("duel-select-cards-modal")).toBeVisible();
  await expect(page.getByTestId("duel-material-controls")).toHaveCount(0);
  await page.mouse.click(640, 300, { button: "right" });
  await expectPacket(page, -1);
});

test("a replacement field request starts empty and right click cancels only the current request", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  const begin = (max: number) =>
    page.evaluate(async (max) => {
      const { getUIContainer } = await import("/src/container/compat.ts");
      const { ygopro } = await import("/src/api/index.ts");
      const { default: selectCard } = await import(
        "/src/service/duel/selectCard.ts"
      );
      void selectCard(
        getUIContainer(),
        new ygopro.StocGameMessage.MsgSelectCard({
          player: 0,
          cancelable: true,
          min: 1,
          max,
          cards: [0, 1, 2].map(
            (sequence) =>
              new ygopro.StocGameMessage.MsgSelectCard.SelectAbleCard({
                code: 46986414,
                location: new ygopro.CardLocation({
                  controller: 0,
                  zone: ygopro.CardZone.MZONE,
                  sequence,
                }),
                response: sequence + 5,
              }),
          ),
        }),
      );
    }, max);
  await begin(2);
  await expect(page.getByTestId("duel-field-selection")).toBeVisible();
  await page.locator('[data-card-uuid="p0-MZONE-0"]').click();
  await expect(page.getByTestId("duel-select-card-submit")).toBeEnabled();
  await begin(1);
  await expect(page.getByTestId("duel-select-card-submit")).toBeDisabled();
  await expect(page.locator('[data-card-selected="true"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
  await page.mouse.click(640, 300, { button: "right" });
  await page.mouse.click(640, 300, { button: "right" });
  await expectPacket(page, -1);
});

test("optional popup selections send one cancel response on right click", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await beginIncremental(page, { zone: "GRAVE", cancelable: true });
  await expect(page.getByTestId("duel-select-cards-modal")).toBeVisible();
  await page.mouse.click(640, 300, { button: "right" });
  await page.mouse.click(640, 300, { button: "right" });
  await expectPacket(page, -1);
});

test("right click declines the topmost inquiry without closing the menu underneath", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.getByTestId("duel-settings").click();
  await page.evaluate(async () => {
    const { displayYesNoModal } = await import(
      "/src/ui/Duel/Message/YesNoModal/index.tsx"
    );
    const { fetchCard } = await import("/src/api/index.ts");
    void displayYesNoModal("是否发动这个效果？", fetchCard(46986414));
  });
  await expect(page.getByTestId("duel-yesno-modal")).toBeVisible();
  await page.mouse.click(640, 300, { button: "right" });
  await expectPacket(page, false);
  await expect(page.getByTestId("duel-settings-panel")).toBeVisible();
  await page.mouse.click(640, 300, { button: "right" });
  await expect(page.getByTestId("duel-settings-panel")).toHaveCount(0);
  await expectPacket(page, false);
});

test("right click closes local action choices but keeps forced effect choices pending", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { displayOptionModal } = await import(
      "/src/ui/Duel/Message/OptionModal/index.tsx"
    );
    void displayOptionModal(
      "选择发动效果",
      [
        { info: "效果一", response: 5 },
        { info: "效果二", response: 65541 },
      ],
      1,
      "idle",
    );
  });
  await expect(page.getByTestId("duel-option-modal")).toBeVisible();
  await page.mouse.click(640, 300, { button: "right" });
  await expect(page.getByTestId("duel-option-modal")).not.toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
  await page.evaluate(async () => {
    const { displayOptionModal } = await import(
      "/src/ui/Duel/Message/OptionModal/index.tsx"
    );
    void displayOptionModal(
      "必须选择效果",
      [
        { info: "效果一", response: 0 },
        { info: "效果二", response: 1 },
      ],
      1,
    );
  });
  await expect(page.getByTestId("duel-option-modal")).toBeVisible();
  await page.mouse.click(640, 300, { button: "right" });
  await page.mouse.click(640, 300, { button: "right" });
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
  await expect(page.getByTestId("duel-option-modal")).toBeVisible();
});
