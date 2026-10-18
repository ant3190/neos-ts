import { expect, type Page, test } from "@playwright/test";

import { mdpro3Fixture } from "./helpers/mdpro3Fixture";

const opening = [100000001, 100000002, 46986414, 100000003, 100000001];
const shuffled = [46986414, 100000001, 100000003, 100000001, 100000002];
const uint32 = (value: number) => [
  value & 255,
  (value >>> 8) & 255,
  (value >>> 16) & 255,
  value >>> 24,
];
const identities = (message: number, player: number, codes: number[]) => [
  message,
  player,
  codes.length,
  ...codes.flatMap(uint32),
];

async function send(page: Page, messages: number[][]) {
  await page.evaluate(async (messages) => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { default: receive } = await import(
      "/src/service/onSocketMessage.ts"
    );
    const bytes = new Uint8Array(
      messages.flatMap((message) => [
        (message.length + 1) & 255,
        (message.length + 1) >>> 8,
        1,
        ...message,
      ]),
    );
    await receive(
      getUIContainer(),
      new MessageEvent("message", { data: bytes.buffer }),
    );
  }, messages);
}

async function start(page: Page) {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { animationSettings } = await import(
      "/src/ui/Duel/animation/runtime.ts"
    );
    animationSettings.mode = "full";
    cardStore.reset();
  });
  await send(page, [
    [4, 0, ...uint32(8000), ...uint32(8000), 40, 0, 5, 0, 40, 0, 5, 0],
  ]);
  await expect(page.locator('[data-card-zone="DECK"]')).toHaveCount(80);
}

async function visibleHand(page: Page, player = 0) {
  return page
    .locator(`[data-card-zone="HAND"][data-card-controller="${player}"]`)
    .evaluateAll((nodes) =>
      nodes
        .map((node) => ({
          uuid: node.getAttribute("data-card-uuid"),
          code: Number(node.getAttribute("data-card-code")),
          x: node.getBoundingClientRect().x,
          y: node.getBoundingClientRect().y,
        }))
        .sort((a, b) => a.x - b.x),
    );
}

test("opening deck queries and shuffle messages never animate either pile or play shuffle audio", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { settingStore } = await import("/src/stores/settingStore/index.ts");
    const { eventbus, Task } = await import("/src/infra/index.ts");
    const { audioContextManger } = await import(
      "/src/infra/audio/core/manager.ts"
    );
    const moves: { zone: number; instant: boolean }[] = [];
    const sounds: number[] = [];
    (window as any).__shuffleTrace = { moves, sounds };
    const call = eventbus.call;
    eventbus.call = (task: any, ...args: any[]) => {
      if (task === Task.Move) {
        const card = cardStore.inner.find((card) => card.uuid === args[0]);
        if (card)
          moves.push({ zone: card.location.zone, instant: !!args[1]?.instant });
      }
      return call(task, ...args);
    };
    settingStore.audio.enableSoundEffects = true;
    audioContextManger.playEffect = async (effect: number) => {
      sounds.push(effect);
    };
  });
  const queries = [0, 1].map((player) => [
    6,
    player,
    0x40,
    ...Array.from({ length: 5 }, (_, sequence) => [
      ...uint32(12),
      ...uint32(2),
      player,
      0x40,
      sequence,
      8,
    ]).flat(),
  ]);
  await send(page, [
    ...queries,
    [32, 0],
    [32, 1],
    identities(39, 0, opening),
    identities(39, 1, [0, 0, 0, 0, 0]),
  ]);
  const trace = await page.evaluate(() => (window as any).__shuffleTrace);
  expect(
    trace.moves.filter((move: { instant: boolean }) => !move.instant),
  ).toEqual([]);
  expect(trace.sounds).not.toContain(204);
  await expect(page.locator('[data-effect-kind="shuffle"]')).toHaveCount(0);
});

test("opening draws take the actual top card first for both players", async ({
  page,
}) => {
  await start(page);
  const tops = await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    return [0, 1].map(
      (player) => cardStore.at(ygopro.CardZone.DECK, player, 39)!.uuid,
    );
  });
  await send(page, [
    identities(90, 0, opening),
    identities(90, 1, [0, 0, 0, 0, 0]),
  ]);
  for (const [player, uuid] of tops.entries()) {
    const card = page.locator(`[data-card-uuid="${uuid}"]`);
    await expect(card).toHaveAttribute("data-card-zone", "HAND");
    await expect(card).toHaveAttribute("data-card-sequence", "0");
    await expect(card).toHaveAttribute(
      "data-card-code",
      `${player ? 0 : opening[0]}`,
    );
  }
});

test("repeated engine hand shuffles preserve visible cards and duplicate identities while commands follow the wire slots", async ({
  page,
}) => {
  await start(page);
  await send(page, [identities(90, 0, opening)]);
  const before = await visibleHand(page);
  for (const codes of [shuffled, [...shuffled].reverse(), shuffled]) {
    await send(page, [identities(33, 0, codes)]);
    expect(await visibleHand(page)).toEqual(before);
    const wireCodes = await page.evaluate(async () => {
      const { cardStore } = await import("/src/stores/index.ts");
      const { ygopro } = await import("/src/api/index.ts");
      return cardStore
        .at(ygopro.CardZone.HAND, 0)
        .sort((a, b) => a.location.sequence - b.location.sequence)
        .map((card) => card.code);
    });
    expect(wireCodes).toEqual(codes);
  }
  // A draw appends to the wire hand; a search may insert at a different slot.
  await send(page, [
    identities(90, 0, [100000002]),
    [50, ...uint32(100000003), 0, 1, 0, 8, 0, 2, 0, 1, ...uint32(0)],
  ]);
  const expanded = await visibleHand(page);
  expect(
    expanded.slice(0, 5).map(({ uuid, code }) => ({ uuid, code })),
  ).toEqual(before.map(({ uuid, code }) => ({ uuid, code })));
  await send(page, [
    identities(
      33,
      0,
      [
        46986414, 100000002, 100000003, 100000001, 100000002, 100000003,
        100000001,
      ],
    ),
  ]);
  expect(await visibleHand(page)).toEqual(expanded);
  await send(page, [
    [
      11,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      ...uint32(shuffled[0]),
      0,
      2,
      0,
      ...uint32(0),
      1,
      1,
      1,
    ],
  ]);
  const selected = before.find((card) => card.code === shuffled[0])!;
  await page.locator(`[data-card-uuid="${selected.uuid}"]`).click();
  await page.getByTestId("duel-action-activate").click();
  const packets = await page.evaluate(() => (window as any).__parityPackets);
  expect(packets).toHaveLength(1);
  expect(packets[0].slice(-4)).toEqual(uint32(5));
  await send(page, [
    [50, ...uint32(shuffled[0]), 0, 2, 0, 1, 0, 16, 0, 1, ...uint32(0)],
  ]);
  await expect(
    page.locator(`[data-card-uuid="${selected.uuid}"]`),
  ).toHaveAttribute("data-card-zone", "GRAVE");
  const after = await visibleHand(page);
  expect(after.map(({ uuid, code }) => ({ uuid, code }))).toEqual(
    expanded
      .filter((card) => card.uuid !== selected.uuid)
      .map(({ uuid, code }) => ({ uuid, code })),
  );
});

test("concealing an opponent's revealed hand changes only the faces without moving the cards", async ({
  page,
}) => {
  await start(page);
  await send(page, [identities(90, 1, opening)]);
  const before = await visibleHand(page, 1);
  await send(page, [identities(33, 1, [0, 0, 0, 0, 0])]);
  expect(await visibleHand(page, 1)).toEqual(
    before.map((card) => ({ ...card, code: 0 })),
  );
  const hidden = await page
    .locator('[data-card-zone="HAND"][data-card-controller="1"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        rotation: (node as HTMLElement).style.getPropertyValue("--ry"),
        moving: node.getAttribute("data-card-in-motion"),
      })),
    );
  expect(hidden).toEqual(
    Array.from({ length: 5 }, () => ({ rotation: "180", moving: "false" })),
  );
});
