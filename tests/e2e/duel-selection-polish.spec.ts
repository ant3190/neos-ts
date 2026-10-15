import { expect, test, type Page } from "@playwright/test";

import { mdpro3Fixture } from "./helpers/mdpro3Fixture";

async function openSelection(
  page: Page,
  counts = { candidates: 6, selected: 0, mandatory: 0 },
) {
  await page.evaluate(async (counts) => {
    const { displaySelectActionsModal } = await import(
      "/src/ui/Duel/Message/SelectActionsModal/index.tsx"
    );
    const { fetchCard, ygopro } = await import("/src/api/index.ts");
    const zones = [
      ygopro.CardZone.MZONE,
      ygopro.CardZone.GRAVE,
      ygopro.CardZone.DECK,
    ];
    const option = (index: number) => ({
      meta: fetchCard(46986414),
      location: new ygopro.CardLocation({
        controller: index % 2,
        zone: zones[Math.floor(index / 2) % zones.length],
        sequence: Math.floor(index / 6),
      }),
      response: index,
    });
    void displaySelectActionsModal({
      min: 1,
      max: 3,
      cancelable: true,
      finishable: true,
      selectables: Array.from({ length: counts.candidates }, (_, i) =>
        option(i),
      ),
      selecteds: Array.from({ length: counts.selected }, (_, i) =>
        option(i + 40),
      ),
      mustSelects: Array.from({ length: counts.mandatory }, (_, i) =>
        option(i + 60),
      ),
    });
  }, counts);
  await expect(page.getByTestId("duel-select-cards-modal")).toBeVisible();
}

test("drawing and searching only slide existing hands sideways, without lift or order changes", async ({
  page,
}) => {
  await mdpro3Fixture(page, 10);
  const result = await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { animationSettings } = await import(
      "/src/ui/Duel/animation/runtime.ts"
    );
    const { default: draw } = await import("/src/service/duel/draw.ts");
    const { default: move } = await import("/src/service/duel/move.ts");
    animationSettings.mode = "full";
    const tracked = [0, 1].map((controller) =>
      cardStore
        .at(ygopro.CardZone.HAND, controller)
        .slice()
        .sort((a, b) => a.location.sequence - b.location.sequence)
        .map((card) => {
          const node = document.querySelector(
            `[data-card-uuid="${card.uuid}"] [data-card-face]`,
          )!;
          return { node, uuid: card.uuid, y: node.getBoundingClientRect().y };
        }),
    );
    let frames = 0,
      maxVerticalChange = 0,
      orderChanged = false,
      running = true;
    const sample = () => {
      frames++;
      tracked.forEach((cards, controller) => {
        const boxes = cards.map(({ node, y }) => {
          const box = node.getBoundingClientRect();
          maxVerticalChange = Math.max(maxVerticalChange, Math.abs(box.y - y));
          return box;
        });
        for (let i = 1; i < boxes.length; i++) {
          if ((boxes[i].x - boxes[i - 1].x) * (controller ? -1 : 1) < 0)
            orderChanged = true;
        }
      });
      if (running) requestAnimationFrame(sample);
    };
    sample();
    for (const controller of [0, 1]) {
      await draw(
        getUIContainer(),
        new ygopro.StocGameMessage.MsgDraw({
          player: controller,
          cards: [controller ? 0 : 46986414],
        }),
      );
      const card = cardStore.at(ygopro.CardZone.GRAVE, controller, 0)!;
      await move(
        getUIContainer(),
        new ygopro.StocGameMessage.MsgMove({
          code: controller ? 0 : 46986414,
          from: new ygopro.CardLocation(card.location.toObject()),
          to: new ygopro.CardLocation({
            controller,
            zone: ygopro.CardZone.HAND,
            sequence: cardStore.at(ygopro.CardZone.HAND, controller).length,
            position: ygopro.CardPosition.FACEUP_ATTACK,
          }),
          reason: 0,
        }),
      );
    }
    await new Promise(requestAnimationFrame);
    running = false;
    return {
      frames,
      maxVerticalChange,
      orderChanged,
      counts: [0, 1].map(
        (controller) => cardStore.at(ygopro.CardZone.HAND, controller).length,
      ),
    };
  });
  expect(result.frames).toBeGreaterThan(20);
  expect(result.maxVerticalChange).toBeLessThan(0.5);
  expect(result.orderChanged).toBe(false);
  expect(result.counts).toEqual([12, 12]);
});

test("mixed zones share one row with a single frame for each owner and zone", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await openSelection(page, { candidates: 12, selected: 0, mandatory: 0 });
  const row = page.getByTestId("duel-select-candidates");
  const cards = row.getByTestId("duel-select-card-option");
  const frames = row.getByTestId("duel-select-origin-group");
  await expect(cards).toHaveCount(12);
  await expect(frames).toHaveCount(6);
  await expect(cards.filter({ hasText: /我方|对方|墓地/ })).toHaveCount(0);
  for (const owner of ["我方", "对方"]) {
    for (const zone of ["怪兽区", "墓地", "主卡组"]) {
      const frame = row.getByRole("group", {
        name: `${owner} ${zone}`,
        exact: true,
      });
      await expect(frame.locator("legend")).toHaveText(`${owner} ${zone}`);
      await expect(frame.getByTestId("duel-select-card-option")).toHaveCount(2);
    }
  }
  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().y),
  );
  expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(0.5);
  await expect(page.getByRole("navigation", { name: "卡片区域" })).toHaveCount(
    0,
  );
  await expect
    .poll(() =>
      row.evaluate(
        (node) => getComputedStyle(node.closest(".ant-modal-content")!).opacity,
      ),
    )
    .toBe("1");
  await page.screenshot({ path: test.info().outputPath("origin-groups.png") });
  const deckCard = row.locator('[data-card-response="4"]');
  await deckCard.click();
  await expect(deckCard).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("duel-select-card-submit").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__parityPackets.length))
    .toBe(1);
  const response = await page.evaluate(async () => {
    const { sendSelectMultiResponse } = await import("/src/api/index.ts");
    const packets: number[][] = [];
    sendSelectMultiResponse(
      {
        ws: { send: (bytes: Uint8Array) => packets.push([...bytes]) },
      } as any,
      [4],
    );
    return { expected: packets[0], actual: (window as any).__parityPackets[0] };
  });
  expect(response.actual).toEqual(response.expected);
});

test("mouse wheels browse candidate and selected card rows independently", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await openSelection(page, { candidates: 18, selected: 12, mandatory: 0 });
  for (const id of ["duel-select-candidates", "duel-select-selected"]) {
    const strip = page.getByTestId(id);
    await strip.getByTestId("duel-select-card-option").first().hover();
    await page.mouse.wheel(0, 380);
    await expect
      .poll(() => strip.evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(100);
    await page.mouse.wheel(0, -380);
    await expect.poll(() => strip.evaluate((node) => node.scrollLeft)).toBe(0);
  }
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
});

test("selected and mandatory rows grow the popup upward while keeping all rows and footer visible", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await openSelection(page);
  const content = page.locator(".ant-modal:visible .ant-modal-content");
  const single = (await content.boundingBox())!;
  await openSelection(page, { candidates: 6, selected: 3, mandatory: 2 });
  const expanded = (await content.boundingBox())!;
  expect(expanded.height - single.height).toBeGreaterThan(220);
  expect(expanded.y).toBeLessThan(single.y - 220);
  expect(expanded.y + expanded.height).toBeCloseTo(single.y + single.height, 1);
  const body = page.locator(".ant-modal:visible .ant-modal-body");
  expect(
    await body.evaluate((node) => node.scrollHeight - node.clientHeight),
  ).toBeLessThanOrEqual(1);
  for (const id of [
    "duel-select-candidates",
    "duel-select-selected",
    "duel-select-mandatory",
    "duel-select-card-submit",
  ]) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(720);
  }
  await page
    .getByTestId("duel-select-mandatory")
    .getByTestId("duel-select-card-option")
    .first()
    .dblclick();
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
  await page.screenshot({
    path: test.info().outputPath("expanded-selection.png"),
  });
});

test("both effect pickers retain readable text after scaling and long lists scroll with the wheel", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { displaySelectActionsModal } = await import(
      "/src/ui/Duel/Message/SelectActionsModal/index.tsx"
    );
    const { cardStore } = await import("/src/stores/index.ts");
    const card = cardStore.inner.find((entry) => entry.uuid === "p0-MZONE-2")!;
    void displaySelectActionsModal({
      isChain: true,
      min: 1,
      max: 1,
      selectables: [0, 1].map((index) => ({
        meta: card.meta,
        location: card.location,
        response: index + 3,
        effectDesc: index
          ? "从墓地选择一张卡加入手牌。"
          : "选择场上一张表侧表示的卡，将其破坏。",
      })),
    });
  });
  await page.getByTestId("duel-select-card-option").click();
  const fontSize = () =>
    page
      .getByTestId("duel-chain-effect-option")
      .first()
      .evaluate((node) => {
        const stage = document.querySelector('[data-testid="duel-stage"]')!;
        return (
          (parseFloat(getComputedStyle(node).fontSize) *
            stage.getBoundingClientRect().height) /
          1080
        );
      });
  await expect.poll(fontSize).toBeGreaterThanOrEqual(17.9);
  await page.setViewportSize({ width: 960, height: 540 });
  await expect.poll(fontSize).toBeGreaterThanOrEqual(17.9);
  await page.getByTestId("duel-chain-effect-option").nth(1).click();
  await page.getByTestId("duel-select-card-submit").click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(async () => {
    const { displayOptionModal } = await import(
      "/src/ui/Duel/Message/OptionModal/index.tsx"
    );
    void displayOptionModal(
      "选择要发动的效果",
      Array.from({ length: 12 }, (_, i) => ({
        info: `效果 ${
          i + 1
        }：从卡组、墓地或除外的卡片中选择一张满足条件的卡加入手牌。`,
        response: i,
      })),
      1,
    );
  });
  const item = page.getByTestId("duel-option-item").first();
  expect(
    await item.evaluate(
      (node) => (parseFloat(getComputedStyle(node).fontSize) * 2) / 3,
    ),
  ).toBeGreaterThanOrEqual(17.9);
  await item.hover();
  await page.mouse.wheel(0, 420);
  const body = page.locator(".ant-modal:visible .ant-modal-body");
  await expect
    .poll(() => body.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(50);
  await expect(page.getByTestId("duel-option-submit")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("readable-effects.png"),
  });
});
