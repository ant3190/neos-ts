import { expect, test, type Page } from "@playwright/test";
import { mdpro3Fixture } from "./helpers/mdpro3Fixture";

const packets = (page: Page) =>
  page.evaluate(() => (window as any).__parityPackets as number[][]);
async function expectResponse(page: Page, values: number[]) {
  await expect.poll(async () => (await packets(page)).length).toBe(1);
  const expected = await page.evaluate(async (values) => {
    const { sendSelectMultiResponse } = await import("/src/api/index.ts");
    const result: number[][] = [];
    sendSelectMultiResponse(
      { ws: { send: (data: Uint8Array) => result.push([...data]) } } as any,
      values,
    );
    return result;
  }, values);
  expect(await packets(page)).toEqual(expected);
}

async function beginChoice(page: Page, zone: string, count = 1, min = count) {
  await page.evaluate(
    async ({ zone, count, min }) => {
      const { getUIContainer } = await import("/src/container/compat.ts");
      const { ygopro } = await import("/src/api/index.ts");
      const { default: select } = await import(
        "/src/service/duel/selectCard.ts"
      );
      const Msg = ygopro.StocGameMessage.MsgSelectCard;
      void select(
        getUIContainer(),
        new Msg({
          player: 0,
          cancelable: true,
          min,
          max: count,
          cards: Array.from(
            { length: count },
            (_, sequence) =>
              new Msg.SelectAbleCard({
                code: 46986414,
                response: 7 + sequence * 2,
                location: new ygopro.CardLocation({
                  controller: 0,
                  zone: ygopro.CardZone[zone],
                  sequence,
                }),
              }),
          ),
        }),
      );
    },
    { zone, count, min },
  );
}

for (const zone of ["MZONE", "GRAVE"]) {
  test(`one legal ${zone} candidate still waits for an explicit confirmation`, async ({
    page,
  }) => {
    await mdpro3Fixture(page);
    await beginChoice(page, zone);
    const confirm = page.getByTestId("duel-select-card-submit");
    await expect(confirm).toBeDisabled();
    const card =
      zone === "MZONE"
        ? page.locator('[data-card-uuid="p0-MZONE-0"]')
        : page.getByTestId("duel-select-card-option");
    await card.click();
    await expect(confirm).toBeEnabled();
    expect(await packets(page)).toEqual([]);
    await confirm.click();
    await expectResponse(page, [7]);
  });
}

test("a legal zero-card choice can be explicitly confirmed without sending cancel", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await beginChoice(page, "GRAVE", 1, 0);
  const confirm = page.getByTestId("duel-select-card-submit");
  await expect(confirm).toBeEnabled();
  expect(await packets(page)).toEqual([]);
  await confirm.click();
  await expectResponse(page, []);
});

test("selecting the maximum or double clicking a popup card never bypasses confirmation", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await beginChoice(page, "GRAVE", 2);
  const choices = page.getByTestId("duel-select-card-option");
  await choices.nth(0).click();
  await choices.nth(1).click();
  const confirm = page.getByTestId("duel-select-card-submit");
  await expect(confirm).toBeEnabled();
  await choices.nth(0).dblclick();
  await expect(confirm).toBeEnabled();
  expect(await packets(page)).toEqual([]);
  await confirm.click();
  await expectResponse(page, [9, 7]);
});

async function beginIncremental(page: Page, zone = "MZONE") {
  await page.evaluate(async (zone) => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: select } = await import(
      "/src/service/duel/selectUnselectCard.ts"
    );
    const Msg = ygopro.StocGameMessage.MsgSelectUnselectCard;
    const info = (sequence: number, response: number) =>
      new Msg.Info({
        code: 46986414,
        response,
        location: new ygopro.CardLocation({
          controller: 0,
          zone: ygopro.CardZone[zone],
          sequence,
        }),
      });
    void select(
      getUIContainer(),
      new Msg({
        player: 0,
        min: 1,
        max: 3,
        finishable: false,
        cancelable: true,
        selectable_cards: [info(1, 11), info(2, 13)],
        selected_cards: [info(0, 6)],
      }),
    );
  }, zone);
}

test("incremental field choices can be corrected or cleared before sending one response", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await beginIncremental(page);
  const confirm = page.getByTestId("duel-material-confirm");
  await page.locator('[data-card-uuid="p0-MZONE-1"]').click();
  await expect(confirm).toBeEnabled();
  await page.mouse.click(640, 300, { button: "right" });
  await expect(confirm).toBeDisabled();
  expect(await packets(page)).toEqual([]);
  await page.locator('[data-card-uuid="p0-MZONE-1"]').click();
  await page.locator('[data-card-uuid="p0-MZONE-2"]').click();
  expect(await packets(page)).toEqual([]);
  await confirm.click();
  await expectResponse(page, [13]);
});

test("unselecting a material in a popup also waits for confirmation", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await beginIncremental(page, "HAND");
  const selected = page
    .getByTestId("duel-select-selected")
    .locator('[data-card-response="6"]');
  await selected.click();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  const confirm = page.getByTestId("duel-select-card-submit");
  await expect(confirm).toBeEnabled();
  expect(await packets(page)).toEqual([]);
  await confirm.click();
  await expectResponse(page, [6]);
});

test("a replacement incremental request cannot submit a previous pending choice", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await beginIncremental(page);
  await page.locator('[data-card-uuid="p0-MZONE-1"]').click();
  await expect(page.getByTestId("duel-material-confirm")).toBeEnabled();
  await beginIncremental(page);
  await expect(page.getByTestId("duel-material-confirm")).toBeDisabled();
  expect(await packets(page)).toEqual([]);
  await page.locator('[data-card-uuid="p0-MZONE-2"]').click();
  await page.getByTestId("duel-material-confirm").click();
  await expectResponse(page, [13]);
});

interface RevealRow {
  code: number;
  controller: number;
  zone: number;
  sequence: number;
}
async function reveal(
  page: Page,
  command: number,
  rows: RevealRow[],
  extended = false,
) {
  await page.evaluate(
    async ({ command, rows, extended }) => {
      const { getUIContainer } = await import("/src/container/compat.ts");
      const { cardStore } = await import("/src/stores/index.ts");
      const { animationSettings } = await import(
        "/src/ui/Duel/animation/runtime.ts"
      );
      animationSettings.mode = "full";
      const { default: Adapter } = await import(
        "/src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/mod.ts"
      );
      const { default: handle } = await import("/src/service/duel/gameMsg.ts");
      const header = extended ? 4 : 3,
        bytes = new Uint8Array(header + rows.length * 7),
        view = new DataView(bytes.buffer);
      bytes[0] = command;
      bytes[1] = command === 31 ? 0 : 1;
      if (extended) bytes[2] = 0;
      bytes[header - 1] = rows.length;
      rows.forEach((row, index) => {
        const offset = header + index * 7;
        view.setUint32(offset, row.code, true);
        bytes.set([row.controller, row.zone, row.sequence], offset + 4);
      });
      (window as any).__beforeReveal = JSON.stringify(
        cardStore.inner.map((card) => ({
          uuid: card.uuid,
          code: card.code,
          meta: card.meta.id,
          location: card.location.toObject(),
        })),
      );
      (window as any).__revealDone = false;
      void handle(
        getUIContainer(),
        new Adapter({ exData: bytes } as any).upcast(),
      ).then(() => ((window as any).__revealDone = true));
    },
    { command, rows, extended },
  );
}

async function privateStateUnchanged(page: Page) {
  const state = await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { cardMotionState } = await import(
      "/src/ui/Duel/animation/motionState.ts"
    );
    return {
      before: (window as any).__beforeReveal,
      after: JSON.stringify(
        cardStore.inner.map((card) => ({
          uuid: card.uuid,
          code: card.code,
          meta: card.meta.id,
          location: card.location.toObject(),
        })),
      ),
      moving: Object.keys(cardMotionState.moving),
      turned: Object.keys(cardMotionState.revealed),
    };
  });
  expect(state.after).toBe(state.before);
  expect(state.moving).toEqual([]);
  expect(state.turned).toEqual([]);
}

for (const scenario of [
  {
    name: "legacy hand",
    command: 31,
    zone: 2,
    extended: false,
    sequences: [0, 1, 2],
  },
  {
    name: "extended hand",
    command: 31,
    zone: 2,
    extended: true,
    sequences: [0, 1, 2],
  },
  {
    name: "extra cards",
    command: 31,
    zone: 0x40,
    extended: true,
    sequences: [6, 5, 4],
  },
  {
    name: "extra top",
    command: 42,
    zone: 0x40,
    extended: false,
    sequences: [5, 3, 2],
  },
  {
    name: "deck top",
    command: 30,
    zone: 1,
    extended: false,
    sequences: [34, 33, 32],
  },
]) {
  test(`${scenario.name} lists every public card at once without flipping its hidden source`, async ({
    page,
  }) => {
    await mdpro3Fixture(page);
    const codes = [46986414, 100000001, 46986414];
    await reveal(
      page,
      scenario.command,
      scenario.sequences.map((sequence, i) => ({
        code: codes[i],
        controller: 1,
        zone: scenario.zone,
        sequence,
      })),
      scenario.extended,
    );
    const modal = page.getByTestId("duel-confirm-cards-modal");
    await expect(modal).toBeVisible();
    const cards = page.getByTestId("duel-confirm-card");
    await expect(cards).toHaveCount(3);
    expect(
      await cards.evaluateAll((nodes) =>
        nodes.map((n) => Number(n.getAttribute("data-card-code"))),
      ),
    ).toEqual(codes);
    expect(
      await cards.evaluateAll((nodes) =>
        nodes.map((n) => Number(n.getAttribute("data-card-sequence"))),
      ),
    ).toEqual(scenario.sequences);
    for (let i = 0; i < 3; i++)
      await expect(cards.nth(i).locator("img")).toHaveAttribute(
        "src",
        new RegExp(String(codes[i])),
      );
    expect(await page.evaluate(() => (window as any).__revealDone)).toBe(false);
    expect(await packets(page)).toEqual([]);
    await privateStateUnchanged(page);
    await cards.nth(0).click();
    await expect(modal).toBeVisible();
    expect(await packets(page)).toEqual([]);
    await page.getByTestId("duel-confirm-cards-close").click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__revealDone))
      .toBe(true);
    await expect(modal).toHaveCount(0);
    await privateStateUnchanged(page);
    expect(await packets(page)).toEqual([]);
  });
}

test("an extra card is displayed from the event even when its source is not in the field store", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await reveal(page, 42, [
    { code: 46986414, controller: 1, zone: 0x40, sequence: 99 },
  ]);
  await expect(page.getByTestId("duel-confirm-card")).toHaveAttribute(
    "data-card-code",
    "46986414",
  );
  await privateStateUnchanged(page);
  await page.getByTestId("duel-confirm-cards-close").click();
});

test("a full extra deck scrolls as one list and leaves confirmation visible on a portrait screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mdpro3Fixture(page);
  await reveal(
    page,
    42,
    Array.from({ length: 15 }, (_, i) => ({
      code: 46986414,
      controller: 1,
      zone: 0x40,
      sequence: 14 - i,
    })),
  );
  await expect(page.getByTestId("duel-confirm-card")).toHaveCount(15);
  const row = page
    .getByTestId("duel-confirm-cards-modal")
    .getByTestId("duel-select-candidates");
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 900);
  await expect
    .poll(() => row.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  const button = page.getByTestId("duel-confirm-cards-close");
  await expect(button).toBeVisible();
  const bounds = (await button.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: test.info().outputPath("revealed-extra-portrait.png"),
  });
  await button.click();
});

test("a reveal list keeps its cards and confirmation usable in a short landscape viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await mdpro3Fixture(page);
  await reveal(
    page,
    42,
    Array.from({ length: 8 }, (_, i) => ({
      code: 46986414,
      controller: 1,
      zone: 0x40,
      sequence: 7 - i,
    })),
  );
  const modal = page.getByRole("dialog", { name: /确认展示卡片/ });
  await expect(modal).toBeVisible();
  const bounds = (await modal.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(360);
  const button = page.getByTestId("duel-confirm-cards-close");
  await expect(button).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("revealed-extra-landscape.png"),
  });
  await button.click();
});

test("reset closes an old reveal without letting its promise close a new list", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await reveal(page, 31, [
    { code: 46986414, controller: 1, zone: 2, sequence: 0 },
  ]);
  await expect(page.getByTestId("duel-confirm-cards-modal")).toBeVisible();
  await page.evaluate(async () => {
    const { resetDuelDialogs } = await import("/src/ui/Duel/Message/reset.ts");
    const { displayConfirmCardsModal } = await import(
      "/src/ui/Duel/Message/ConfirmCardsModal/index.tsx"
    );
    const { fetchCard } = await import("/src/api/index.ts");
    resetDuelDialogs();
    void displayConfirmCardsModal([{ meta: fetchCard(100000001) }]);
  });
  await expect(page.getByTestId("duel-confirm-card")).toHaveCount(1);
  await expect(page.getByTestId("duel-confirm-card")).toHaveAttribute(
    "data-card-code",
    "100000001",
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__revealDone))
    .toBe(true);
  await expect(page.getByTestId("duel-confirm-cards-close")).toBeVisible();
  await page.getByTestId("duel-confirm-cards-close").click();
  expect(await packets(page)).toEqual([]);
});
