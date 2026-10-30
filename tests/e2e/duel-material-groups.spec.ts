import { expect, type Page, test } from "@playwright/test";

import { mdpro3Fixture } from "./helpers/mdpro3Fixture";

async function step(
  page: Page,
  zone: string,
  selected: number[],
  options: {
    available?: number[];
    finishable?: boolean;
    cancelable?: boolean;
  } = {},
) {
  await page.evaluate(
    async ({ zone, selected, options }) => {
      const { getUIContainer } = await import("/src/container/compat.ts");
      const { ygopro } = await import("/src/api/index.ts");
      const { default: handle } = await import("/src/service/duel/gameMsg.ts");
      const Msg = ygopro.StocGameMessage.MsgSelectUnselectCard;
      const available =
        options.available ?? [0, 1, 2].filter((i) => !selected.includes(i));
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
      await handle(
        getUIContainer(),
        new ygopro.YgoStocMsg({
          stoc_game_msg: new ygopro.StocGameMessage({
            select_unselect_card: new Msg({
              player: 0,
              min: 2,
              max: 3,
              finishable: options.finishable ?? selected.length >= 2,
              cancelable: options.cancelable ?? selected.length === 0,
              selectable_cards: available.map(info),
              selected_cards: selected.map((sequence, index) =>
                info(sequence, available.length + index),
              ),
            }),
          }),
        }),
      );
    },
    { zone, selected, options },
  );
}

const material = (page: Page, zone: string, sequence: number) =>
  zone === "MZONE"
    ? page.locator(`[data-card-uuid="p0-MZONE-${sequence}"]`)
    : page
        .getByTestId("duel-select-card-option")
        .filter({ has: page.locator("img") })
        .and(page.locator(`[data-card-sequence="${sequence}"]`));
const confirm = (page: Page, zone: string) =>
  page.getByTestId(
    zone === "MZONE" ? "duel-material-confirm" : "duel-select-card-submit",
  );
const cancel = (page: Page, zone: string) =>
  page.getByTestId(
    zone === "MZONE" ? "duel-material-cancel" : "duel-select-card-cancel",
  );
const payloads = (page: Page) =>
  page.evaluate(
    () =>
      (window as any).__parityPackets.map((packet: number[]) =>
        packet.slice(3),
      ) as number[][],
  );
async function expectPayloads(page: Page, values: (number[] | -1)[]) {
  const expected = values.map((value) =>
    value === -1 ? [255, 255, 255, 255] : [value.length, ...value],
  );
  await expect.poll(() => payloads(page)).toEqual(expected);
}

for (const zone of ["MZONE", "HAND"]) {
  test(`${zone} materials form one group with a single final confirmation`, async ({
    page,
  }) => {
    await mdpro3Fixture(page);
    await step(page, zone, []);
    await material(page, zone, 0).click();
    await expectPayloads(page, [[0]]);
    await expect(confirm(page, zone)).toBeDisabled();
    await step(page, zone, [0]);
    await material(page, zone, 2).click();
    await expectPayloads(page, [[0], [1]]);
    await step(page, zone, [0, 2]);
    await expect(confirm(page, zone)).toBeEnabled();
    expect(await payloads(page)).toEqual([
      [1, 0],
      [1, 1],
    ]);
    await confirm(page, zone).click();
    await expectPayloads(page, [[0], [1], -1]);
    await expect(confirm(page, zone)).toHaveCount(0);
  });

  test(`${zone} cancel rolls back every material before exiting a finishable group`, async ({
    page,
  }) => {
    await mdpro3Fixture(page);
    await step(page, zone, [0, 2]);
    await cancel(page, zone).click();
    await expectPayloads(page, [[2]]);
    await expect(confirm(page, zone)).toBeDisabled();
    await step(page, zone, [0]);
    await expectPayloads(page, [[2], [2]]);
    await step(page, zone, []);
    await expectPayloads(page, [[2], [2], -1]);
    await expect(confirm(page, zone)).toHaveCount(0);
  });

  test(`${zone} rapid material clicks follow updated response indices`, async ({
    page,
  }) => {
    await mdpro3Fixture(page);
    await step(page, zone, []);
    await material(page, zone, 0).click();
    await material(page, zone, 2).click();
    await expectPayloads(page, [[0]]);
    await step(page, zone, [0], { available: [2, 1] });
    await expectPayloads(page, [[0], [0]]);
    await step(page, zone, [0, 2]);
    await confirm(page, zone).click();
    await expectPayloads(page, [[0], [0], -1]);
  });
}

test("queued materials that become illegal are discarded", async ({ page }) => {
  await mdpro3Fixture(page);
  await step(page, "MZONE", []);
  await material(page, "MZONE", 0).click();
  await material(page, "MZONE", 2).click();
  await step(page, "MZONE", [0], { available: [1] });
  await expectPayloads(page, [[0]]);
  await expect(material(page, "MZONE", 2)).toHaveAttribute(
    "data-card-selected",
    "false",
  );
  await expect(confirm(page, "MZONE")).toBeDisabled();
});

test("cancel while awaiting an update clears queued clicks and rolls back the accepted material", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await step(page, "MZONE", []);
  await material(page, "MZONE", 0).click();
  await material(page, "MZONE", 2).click();
  await cancel(page, "MZONE").click();
  await expectPayloads(page, [[0]]);
  await step(page, "MZONE", [0]);
  await expectPayloads(page, [[0], [2]]);
  await step(page, "MZONE", []);
  await expectPayloads(page, [[0], [2], -1]);
});

test("a forced selection can clear its materials without sending an illegal exit", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await step(page, "MZONE", [0], { cancelable: false });
  await cancel(page, "MZONE").click();
  await expectPayloads(page, [[2]]);
  await step(page, "MZONE", [], { cancelable: false });
  await expectPayloads(page, [[2]]);
  await expect(cancel(page, "MZONE")).toBeDisabled();
  await expect(confirm(page, "MZONE")).toBeDisabled();
  await material(page, "MZONE", 1).click();
  await expectPayloads(page, [[2], [1]]);
});

test("reset prevents an old cancellation or click from affecting a new request", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await step(page, "MZONE", [0]);
  const oldId = await page.evaluate(
    async () =>
      (await import("/src/ui/Duel/interaction/materialSelection.ts"))
        .materialSelection.requestId,
  );
  await cancel(page, "MZONE").click();
  await page.evaluate(async () =>
    (await import("/src/ui/Duel/Message/reset.ts")).resetDuelDialogs(),
  );
  await step(page, "MZONE", []);
  await page.evaluate(async (oldId) => {
    const { toggleMaterial, cancelMaterials } = await import(
      "/src/ui/Duel/interaction/materialSelection.ts"
    );
    const { ygopro } = await import("/src/api/index.ts");
    toggleMaterial(`0:${ygopro.CardZone.MZONE}:1:`, oldId);
    cancelMaterials(oldId);
  }, oldId);
  await expectPayloads(page, [[2]]);
  await expect(cancel(page, "MZONE")).toBeEnabled();
});

async function publicExtraThenChoice(page: Page, shuffle = false) {
  await page.evaluate(async (shuffle) => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: reveal } = await import(
      "/src/service/duel/confirmCards.ts"
    );
    const { default: select } = await import("/src/service/duel/selectCard.ts");
    const { default: handle } = await import("/src/service/duel/gameMsg.ts");
    const container = getUIContainer(),
      Z = ygopro.CardZone;
    await reveal(
      container,
      new ygopro.StocGameMessage.MsgConfirmCards({
        player: 0,
        cards: [46986414, 100000001].map(
          (code, i) =>
            new ygopro.CardInfo({
              code,
              controller: 1,
              location: Z.EXTRA,
              sequence: 6 - i,
            }),
        ),
      }),
    );
    if (shuffle)
      await handle(
        container,
        new ygopro.YgoStocMsg({
          stoc_game_msg: new ygopro.StocGameMessage({
            shuffle_hand_extra: new ygopro.StocGameMessage.MsgShuffleHandExtra({
              player: 1,
              zone: Z.EXTRA,
              cards: Array(7).fill(0),
            }),
          }),
        }),
      );
    const Msg = ygopro.StocGameMessage.MsgSelectCard;
    void select(
      container,
      new Msg({
        player: 0,
        min: 1,
        max: 1,
        cancelable: true,
        cards: [6, 5, 0].map(
          (sequence, i) =>
            new Msg.SelectAbleCard({
              code: 0,
              response: [9, 3, 7][i],
              location: new ygopro.CardLocation({
                controller: 1,
                zone: Z.EXTRA,
                sequence,
              }),
            }),
        ),
      }),
    );
  }, shuffle);
}

test("revealed opponent extra-deck faces appear in the actual choice with their original indices", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await publicExtraThenChoice(page);
  const cards = page.getByTestId("duel-select-card-option");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveAttribute("data-card-code", "46986414");
  await expect(cards.nth(1)).toHaveAttribute("data-card-code", "100000001");
  await expect(cards.nth(2)).toHaveAttribute("data-card-code", "0");
  await expect(page.getByTestId("duel-confirm-cards-modal")).toHaveCount(0);
  await cards.nth(1).click();
  await expectPayloads(page, []);
  await page.getByTestId("duel-select-card-submit").click();
  await expectPayloads(page, [[3]]);
  await expect(page.locator('[data-card-uuid="p1-EXTRA-5"]')).toHaveAttribute(
    "data-card-code",
    "0",
  );
});

test("shuffling the extra deck invalidates earlier public position identities", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await publicExtraThenChoice(page, true);
  const cards = page.getByTestId("duel-select-card-option");
  await expect(cards).toHaveCount(3);
  for (let i = 0; i < 3; i++)
    await expect(cards.nth(i)).toHaveAttribute("data-card-code", "0");
});

test("both players' defense cards face the correct horizontal direction", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  const angle = (controller: number) =>
    page
      .locator(`[data-card-uuid="p${controller}-MZONE-1"]`)
      .evaluate((node) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
      });
  await expect.poll(() => angle(0)).toBeCloseTo(-90, 1);
  await expect.poll(() => angle(1)).toBeCloseTo(90, 1);
});
