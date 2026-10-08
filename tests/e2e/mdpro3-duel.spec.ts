import { expect, test, type Page } from "@playwright/test";
import { installOfflineDuelResources } from "./helpers/offlineDuel";

async function duelFixture(page: Page) {
  await installOfflineDuelResources(page);
  await page.goto("/");
  await page.waitForFunction(async () => {
    const { initStore } = await import("/src/stores/index.ts");
    return initStore.sqlite.progress === 1 && initStore.i18n;
  });
  await page.evaluate(async () => {
    const { initUIContainer } = await import("/src/container/compat.ts");
    const { cardStore, matStore } = await import("/src/stores/index.ts");
    const { genCard } = await import("/src/service/utils/index.ts");
    const { ygopro, fetchCard } = await import("/src/api/index.ts");
    const { animationSettings } = await import(
      "/src/ui/Duel/animation/runtime.ts"
    );
    animationSettings.mode = "off";
    const packets: number[][] = [];
    (window as any).__mdPackets = packets;
    initUIContainer({
      ws: { send: (packet: Uint8Array) => packets.push([...packet]) },
    } as any);
    matStore.selfType = 1;
    matStore.initInfo.set(0, { life: 8000 });
    matStore.initInfo.set(1, { life: 8000 });
    cardStore.inner = [
      genCard({
        uuid: "fixture-monster",
        code: 46986414,
        meta: fetchCard(46986414),
        location: new ygopro.CardLocation({
          controller: 0,
          zone: ygopro.CardZone.MZONE,
          sequence: 2,
          position: ygopro.CardPosition.FACEUP_ATTACK,
        }),
        counters: {},
        isToken: false,
        targeted: false,
        selectInfo: { selectable: false, selected: false },
        status: 0,
        idleInteractivities: [
          {
            interactType: 6,
            response: 5,
            responseSource: "battle",
            activateIndex: 46986414 * 16,
          },
          {
            interactType: 6,
            response: 65541,
            responseSource: "battle",
            activateIndex: 46986414 * 16 + 1,
          },
          { interactType: 8, response: 1, responseSource: "battle" },
        ],
      }),
    ];
    history.pushState({}, "", "/duel");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.locator('[data-card-uuid="fixture-monster"]'),
  ).toBeVisible();
}

test("near-card buttons select one effect and send exactly one battle response", async ({
  page,
}) => {
  await duelFixture(page);
  await page.locator('[data-card-uuid="fixture-monster"]').click();
  const toolbar = page.getByTestId("duel-card-actions");
  await expect(toolbar).toBeVisible();
  await expect(toolbar.locator("button").first()).toHaveAttribute(
    "data-action-type",
    "ACTIVATE",
  );
  await page.getByTestId("duel-action-activate").click();
  await expect(page.getByTestId("duel-option-modal")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__mdPackets.length))
    .toBe(0);
  await page.getByTestId("duel-option-item").nth(1).click();
  await page.getByTestId("duel-option-submit").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__mdPackets.length))
    .toBe(1);
  const expected = await page.evaluate(async () => {
    const { sendSelectBattleCmdResponse } = await import("/src/api/index.ts");
    const packets: number[][] = [];
    sendSelectBattleCmdResponse(
      {
        ws: { send: (packet: Uint8Array) => packets.push([...packet]) },
      } as any,
      65541,
    );
    return packets[0];
  });
  expect(await page.evaluate(() => (window as any).__mdPackets[0])).toEqual(
    expected,
  );
  await expect(
    page.locator('[data-card-uuid="fixture-monster"]'),
  ).toHaveAttribute("data-card-idle-actions", "");
});

test("a forced chain groups effects by card and requires the effect choice", async ({
  page,
}) => {
  await duelFixture(page);
  await page.evaluate(async () => {
    const { displaySelectActionsModal } = await import(
      "/src/ui/Duel/Message/SelectActionsModal/index.tsx"
    );
    const { cardStore } = await import("/src/stores/index.ts");
    const card = cardStore.inner[0];
    void displaySelectActionsModal({
      isChain: true,
      cancelable: false,
      min: 1,
      max: 1,
      selectables: [
        {
          meta: card.meta,
          location: card.location,
          response: 3,
          effectDesc: "效果一",
        },
        {
          meta: card.meta,
          location: card.location,
          response: 4,
          effectDesc: "效果二",
        },
      ],
    });
  });
  await expect(page.getByTestId("duel-select-card-option")).toHaveCount(1);
  await expect(page.getByTestId("duel-select-card-cancel")).not.toBeVisible();
  await page.getByTestId("duel-select-card-option").click();
  await expect(page.getByTestId("duel-select-card-submit")).toBeDisabled();
  await page.getByTestId("duel-chain-effect-option").nth(1).click();
  await page.getByTestId("duel-select-card-submit").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__mdPackets.length))
    .toBe(1);
});

test("field targets remain pending until confirmation and reset cannot close a new prompt", async ({
  page,
}) => {
  await duelFixture(page);
  await page.evaluate(async () => {
    const { displaySelectActionsModal } = await import(
      "/src/ui/Duel/Message/SelectActionsModal/index.tsx"
    );
    const { cardStore } = await import("/src/stores/index.ts");
    const card = cardStore.inner[0];
    void displaySelectActionsModal({
      fieldSelection: true,
      min: 1,
      max: 1,
      selectables: [{ meta: card.meta, location: card.location, response: 0 }],
    });
  });
  await expect(page.getByTestId("duel-field-selection")).toBeVisible();
  await page.locator('[data-card-uuid="fixture-monster"]').click();
  await expect(
    page.locator('[data-card-uuid="fixture-monster"]'),
  ).toHaveAttribute("data-card-selected", "true");
  expect(await page.evaluate(() => (window as any).__mdPackets.length)).toBe(0);
  await page.getByTestId("duel-select-card-submit").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__mdPackets.length))
    .toBe(1);
  await page.evaluate(async () => {
    const { resetDuelDialogs } = await import("/src/ui/Duel/Message/reset.ts");
    const { displayOptionModal } = await import(
      "/src/ui/Duel/Message/OptionModal/index.tsx"
    );
    void displayOptionModal("旧提示", [{ info: "旧效果", response: 0 }], 1);
    resetDuelDialogs();
    void displayOptionModal("新提示", [{ info: "新效果", response: 1 }], 1);
  });
  await expect(page.getByTestId("duel-option-item")).toContainText("新效果");
  await expect(page.getByTestId("duel-option-modal")).toBeVisible();
});

test("attack declaration draws an aim line without issuing a lunge", async ({
  page,
}) => {
  await duelFixture(page);
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { cardStore } = await import("/src/stores/index.ts");
    const { presentGameMessage } = await import(
      "/src/ui/Duel/animation/present.ts"
    );
    presentGameMessage(
      getUIContainer(),
      new ygopro.StocGameMessage({
        attack: new ygopro.StocGameMessage.MsgAttack({
          attacker_location: cardStore.inner[0].location,
          direct_attack: true,
        }),
      }),
    );
  });
  await expect(page.getByTestId("duel-attack-aim")).toBeVisible();
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { presentGameMessage } = await import(
      "/src/ui/Duel/animation/present.ts"
    );
    const { default: GameMsgAdapter } = await import(
      "/src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/mod.ts"
    );
    const notification = new GameMsgAdapter({
      exData: Uint8Array.of(112),
    } as any).upcast();
    presentGameMessage(getUIContainer(), notification.stoc_game_msg);
  });
  await expect(page.getByTestId("duel-attack-aim")).not.toBeVisible();
});
