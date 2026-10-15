import { expect, test } from "@playwright/test";

import { mdpro3Fixture } from "./helpers/mdpro3Fixture";

test("flat table and opposing HUD anchors fit a 16:9 viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await mdpro3Fixture(page);
  const stage = await page.getByTestId("duel-stage").boundingBox();
  expect(stage!.width).toBeCloseTo(1280, 0);
  expect(stage!.height).toBeCloseTo(720, 0);
  const mine = await page
    .locator('[data-testid="duel-player-life"][data-player="me"]')
    .boundingBox();
  const opponent = await page
    .locator('[data-testid="duel-player-life"][data-player="op"]')
    .boundingBox();
  expect(mine!.x).toBeCloseTo((100 * 2) / 3, 0);
  expect(mine!.y).toBeCloseTo((955 * 2) / 3, 0);
  expect(opponent!.x).toBeCloseTo((1520 * 2) / 3, 0);
  expect(opponent!.y).toBeCloseTo(10, 0);
  // The card's actual face and its slot must share one coordinate system.
  const face = await page
    .locator('[data-card-uuid="p0-MZONE-2"] [data-card-face]')
    .boundingBox();
  const slot = await page
    .locator(
      '[data-testid="duel-zone"][data-zone="MZONE"][data-controller="0"][data-sequence="2"]',
    )
    .boundingBox();
  expect(
    Math.abs(face!.x + face!.width / 2 - slot!.x - slot!.width / 2),
  ).toBeLessThan(2);
  expect(
    Math.abs(face!.y + face!.height / 2 - slot!.y - slot!.height / 2),
  ).toBeLessThan(3);
  await page.screenshot({ path: test.info().outputPath("duel-1280.png") });
});

test("phase picker respects server legality and consumes exactly one command", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { matStore } = await import("/src/stores/index.ts");
    matStore.phase.enableBp = false;
  });
  await page.getByTestId("duel-phase-select").click();
  await expect(page.getByTestId("duel-phase-battle")).toBeDisabled();
  await expect(page.getByTestId("duel-phase-main2")).toBeDisabled();
  await page.getByTestId("duel-phase-end").click();
  await expect(page.getByTestId("duel-phase-select")).toBeDisabled();
  const packets = await page.evaluate(() => (window as any).__parityPackets);
  expect(packets).toHaveLength(1);
  expect(packets[0].slice(-4)).toEqual([7, 0, 0, 0]);
});

test("battle phase commands keep their distinct wire encoding", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { matStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    matStore.commandSource = "battle";
    matStore.phase.currentPhase =
      ygopro.StocGameMessage.MsgNewPhase.PhaseType.BATTLE_STEP;
    matStore.phase.enableM2 = true;
  });
  await page.getByTestId("duel-phase-select").click();
  await page.getByTestId("duel-phase-end").click();
  const packets = await page.evaluate(() => (window as any).__parityPackets);
  expect(packets[0].slice(-4)).toEqual([3, 0, 0, 0]);
});

test("pile inspection replaces the log, supports a grid and restores the log", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.getByTestId("duel-log-toggle").click();
  await expect(page.getByTestId("duel-history")).toBeVisible();
  await page.locator('[data-card-uuid="p1-GRAVE-5"]').click();
  await expect(page.getByTestId("duel-history")).not.toBeVisible();
  await expect(page.getByTestId("duel-card-list")).toBeVisible();
  const before = await page.getByTestId("duel-card-list").boundingBox();
  const canvas = (await page.getByTestId("duel-stage").boundingBox())!;
  const scale = canvas.height / 1080;
  expect(before!.width).toBeCloseTo(130 * scale, 0);
  expect(before!.height).toBeLessThanOrEqual(833 * scale + 1);
  expect(before!.y + before!.height).toBeLessThan(
    (await page.getByTestId("duel-controls").boundingBox())!.y,
  );
  expect(before!.y - canvas.y).toBeCloseTo(140 * scale, 0);
  expect(canvas.x + canvas.width - before!.x - before!.width).toBeCloseTo(
    24 * scale,
    0,
  );
  await page.getByTestId("duel-pile-layout").click();
  await expect
    .poll(
      async () =>
        (await page.getByTestId("duel-card-list").boundingBox())!.width,
    )
    .toBeGreaterThan(before!.width * 1.8);
  await page.getByRole("button", { name: "关闭卡堆", exact: true }).click();
  await expect(page.getByTestId("duel-history")).toBeVisible();
});

test("empty field click dismisses inspection and restores the displaced log", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.locator('[data-card-uuid="p0-MZONE-2"]').click();
  await expect(page.getByTestId("duel-card-description-panel")).toBeVisible();
  await page.getByTestId("duel-log-toggle").click();
  await page.locator('[data-card-uuid="p1-GRAVE-5"]').click();
  await expect(page.getByTestId("duel-card-list")).toBeVisible();
  const stage = (await page.getByTestId("duel-stage").boundingBox())!;
  await page.mouse.click(
    stage.x + stage.width / 2,
    stage.y + stage.height * 0.44,
  );
  await expect(
    page.getByTestId("duel-card-description-panel"),
  ).not.toBeVisible();
  await expect(page.getByTestId("duel-card-list")).not.toBeVisible();
  await expect(page.getByTestId("duel-history")).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
});

test("chat uses the full-height right side panel and field-view keys preserve input", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.getByTestId("duel-chat-toggle").click();
  const chat = page.getByTestId("duel-chat");
  const stage = (await page.getByTestId("duel-stage").boundingBox())!;
  const box = (await chat.boundingBox())!;
  expect(box.width).toBeCloseTo((600 * stage.height) / 1080, 0);
  expect(box.height).toBeCloseTo(stage.height, 0);
  expect(box.x + box.width).toBeCloseTo(stage.x + stage.width, 0);
  await expect(chat.locator("textarea")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(chat).toBeVisible();
  await chat.locator("textarea").evaluate((node) => node.blur());
  await page.keyboard.press("Escape");
  await expect(chat).not.toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
});

test("clicking the painted deck opens buried legal commands without revealing the deck", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { cardStore, InteractType } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    cardStore.at(ygopro.CardZone.DECK, 0, 0)!.idleInteractivities = [
      {
        interactType: InteractType.ACTIVATE,
        response: 5,
        responseSource: "idle",
      },
    ];
  });
  const top = page.locator('[data-card-uuid="p0-DECK-34"]');
  await top.click();
  const activate = page.getByTestId("duel-action-activate");
  await expect(activate).toBeVisible();
  await top.click();
  await expect(activate).toBeVisible();
  await expect(page.getByTestId("duel-card-list")).not.toBeVisible();
  await activate.click();
  const packets = await page.evaluate(() => (window as any).__parityPackets);
  expect(packets).toHaveLength(1);
  expect(packets[0].slice(-4)).toEqual([5, 0, 0, 0]);
});

test("long-hand panning does not send a card response", async ({ page }) => {
  await mdpro3Fixture(page, 14);
  const card = page.locator('[data-card-uuid="p0-HAND-7"]');
  const box = await card.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 100,
    box!.y + box!.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  const state = await page.evaluate(async () => {
    const { handInteraction } = await import(
      "/src/ui/Duel/interaction/hand.ts"
    );
    return {
      offset: handInteraction.offset,
      dragging: handInteraction.dragging,
      packets: (window as any).__parityPackets.length,
    };
  });
  expect(state.offset).toBeGreaterThan(20);
  expect(state.dragging).toBe(false);
  expect(state.packets).toBe(0);
});

test("portrait keeps the same field arrangement without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mdpro3Fixture(page);
  const stage = await page.getByTestId("duel-stage").boundingBox();
  expect(stage!.width).toBeCloseTo(390, 0);
  expect(stage!.width / stage!.height).toBeCloseTo(16 / 9, 2);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: test.info().outputPath("duel-portrait.png") });
});

test("timing button cycles directly and keyboard shortcuts select the requested timing", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  const timing = page.getByTestId("duel-chain-setting");
  await expect(timing).toHaveAttribute("data-chain-setting", "smart");
  await timing.click();
  await expect(timing).toHaveAttribute("data-chain-setting", "all");
  await timing.click();
  await expect(timing).toHaveAttribute("data-chain-setting", "ignore");
  await page.keyboard.press("d");
  await expect(timing).toHaveAttribute("data-chain-setting", "smart");
  await page.keyboard.press("a");
  await expect(timing).toHaveAttribute("data-chain-setting", "all");
  await page.keyboard.press("s");
  await expect(timing).toHaveAttribute("data-chain-setting", "ignore");
});

test("raw PLAYER_HINT effects are deduplicated per player and removed independently", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  const hint = async (player: number, hintType: number) =>
    page.evaluate(
      async ({ player, hintType }) => {
        const { getUIContainer } = await import("/src/container/compat.ts");
        const { default: GameMsgAdapter } = await import(
          "/src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/mod.ts"
        );
        const { default: handleGameMsg } = await import(
          "/src/service/duel/gameMsg.ts"
        );
        const bytes = new Uint8Array(7);
        bytes.set([165, player, hintType]);
        new DataView(bytes.buffer).setUint32(3, 46986414 * 16, true);
        await handleGameMsg(
          getUIContainer(),
          new GameMsgAdapter({ exData: bytes } as any).upcast(),
        );
      },
      { player, hintType },
    );
  await hint(0, 6);
  await hint(0, 6);
  await hint(1, 6);
  await page.getByTestId("duel-attached-effects-toggle").click();
  await expect(page.getByTestId("duel-attached-effect")).toHaveCount(1);
  await expect(page.getByTestId("duel-attached-effect")).toHaveAttribute(
    "data-player-mask",
    "3",
  );
  await hint(0, 7);
  await expect(page.getByTestId("duel-attached-effect")).toHaveAttribute(
    "data-player-mask",
    "2",
  );
  await hint(1, 7);
  await expect(page.getByTestId("duel-attached-effect")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
});

test("life values settle without animation frames", async ({ page }) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { animationSettings } = await import(
      "/src/ui/Duel/animation/runtime.ts"
    );
    const { matStore } = await import("/src/stores/index.ts");
    animationSettings.mode = "full";
    window.requestAnimationFrame = () => 0;
    matStore.initInfo.set(0, { life: 6500 });
  });
  await expect(
    page.locator('[data-testid="duel-player-life-value"][data-player="me"]'),
  ).toHaveText("6500", { timeout: 3000 });
});

test("reset clears panels, hand gesture, effect hints and pending prompts", async ({
  page,
}) => {
  await mdpro3Fixture(page, 14);
  const state = await page.evaluate(async () => {
    const { duelPanels } = await import("/src/ui/Duel/layout/panels.ts");
    const { handInteraction } = await import(
      "/src/ui/Duel/interaction/hand.ts"
    );
    const { resetDuelDialogs } = await import("/src/ui/Duel/Message/reset.ts");
    const { setDuelPrompt, hasDuelPrompt } = await import(
      "/src/ui/Duel/Message/session.ts"
    );
    duelPanels.right = "effects";
    duelPanels.attachedEffects[46986414] = 3;
    handInteraction.offset = 100;
    handInteraction.dragging = true;
    setDuelPrompt("old-duel", true);
    resetDuelDialogs();
    return {
      panel: duelPanels.right,
      hints: Object.keys(duelPanels.attachedEffects).length,
      offset: handInteraction.offset,
      dragging: handInteraction.dragging,
      prompt: hasDuelPrompt(),
    };
  });
  expect(state).toEqual({
    panel: "none",
    hints: 0,
    offset: 0,
    dragging: false,
    prompt: false,
  });
});

test("height-scaled 16:10 and ultrawide layouts keep HUD edges and field projection aligned", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  for (const size of [
    { width: 1280, height: 800 },
    { width: 2560, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(
        async () =>
          (await page.getByTestId("duel-stage").boundingBox())!.height,
      )
      .toBeCloseTo(size.height, 0);
    const mine = await page
      .locator('[data-testid="duel-player-life"][data-player="me"]')
      .boundingBox();
    expect(mine!.x).toBeCloseTo((100 * size.height) / 1080, 0);
    const slot = await page
      .locator(
        '[data-testid="duel-zone"][data-zone="MZONE"][data-controller="0"][data-sequence="2"]',
      )
      .boundingBox();
    const face = await page
      .locator('[data-card-uuid="p0-MZONE-2"] [data-card-face]')
      .boundingBox();
    expect(
      Math.abs(face!.x + face!.width / 2 - slot!.x - slot!.width / 2),
    ).toBeLessThan(3);
  }
});
