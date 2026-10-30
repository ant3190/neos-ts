import { expect, test, type Page } from "@playwright/test";
import { mdpro3Fixture } from "./helpers/mdpro3Fixture";

async function fullMotion(page: Page) {
  await page.evaluate(async () => {
    const { animationSettings } = await import(
      "/src/ui/Duel/animation/runtime.ts"
    );
    animationSettings.mode = "full";
  });
}

test("tokens keep the source 200ms wait without the ordinary summon delay", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await fullMotion(page);
  const elapsed = await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: handle } = await import("/src/service/duel/gameMsg.ts");
    const start = performance.now();
    await handle(
      getUIContainer(),
      new ygopro.YgoStocMsg({
        stoc_game_msg: new ygopro.StocGameMessage({
          sp_summoning: new ygopro.StocGameMessage.MsgSpSummoning({
            code: 110000007,
            location: new ygopro.CardLocation({
              controller: 0,
              zone: ygopro.CardZone.MZONE,
              sequence: 2,
              position: ygopro.CardPosition.FACEUP_ATTACK,
            }),
          }),
        }),
      }),
    );
    return performance.now() - start;
  });
  expect(elapsed).toBeGreaterThanOrEqual(190);
  expect(elapsed).toBeLessThan(700);
});

for (const kind of ["summoning", "sp_summoning"] as const) {
  for (const controller of [0, 1]) {
    test(`${kind}: player ${controller}'s landed card stays still during summon feedback`, async ({
      page,
    }) => {
      await mdpro3Fixture(page);
      await fullMotion(page);
      const result = await page.evaluate(
        async ({ kind, controller }) => {
          const { getUIContainer } = await import("/src/container/compat.ts");
          const { ygopro } = await import("/src/api/index.ts");
          const { default: handle } = await import(
            "/src/service/duel/gameMsg.ts"
          );
          const { duelTimeline } = await import(
            "/src/ui/Duel/animation/runtime.ts"
          );
          const card = document.querySelector<HTMLElement>(
            `[data-card-uuid="p${controller}-MZONE-2"]`,
          )!;
          const origin = card.getBoundingClientRect();
          let maxDrift = 0,
            frames = 0,
            frame = 0,
            moving = false,
            feedback = false;
          const sample = () => {
            const rect = card.getBoundingClientRect();
            maxDrift = Math.max(
              maxDrift,
              Math.abs(rect.x - origin.x),
              Math.abs(rect.y - origin.y),
              Math.abs(rect.width - origin.width),
              Math.abs(rect.height - origin.height),
            );
            moving ||= card.dataset.cardInMotion === "true";
            frames++;
            frame = requestAnimationFrame(sample);
          };
          const release = duelTimeline.subscribe(() => {
            feedback ||= duelTimeline
              .getSnapshot()
              .cues.some(
                (c) =>
                  c.kind === (kind === "summoning" ? "summon" : "special") &&
                  !!c.point,
              );
          });
          frame = requestAnimationFrame(sample);
          try {
            const event = {
              code: 46986414,
              location: new ygopro.CardLocation({
                controller,
                zone: ygopro.CardZone.MZONE,
                sequence: 2,
                position: ygopro.CardPosition.FACEUP_ATTACK,
              }),
            };
            await handle(
              getUIContainer(),
              new ygopro.YgoStocMsg({
                stoc_game_msg: new ygopro.StocGameMessage(
                  kind === "summoning"
                    ? {
                        summoning: new ygopro.StocGameMessage.MsgSummoning(
                          event,
                        ),
                      }
                    : {
                        sp_summoning: new ygopro.StocGameMessage.MsgSpSummoning(
                          event,
                        ),
                      },
                ),
              }),
            );
          } finally {
            cancelAnimationFrame(frame);
            release();
          }
          return { maxDrift, frames, moving, feedback };
        },
        { kind, controller },
      );
      expect(result.frames).toBeGreaterThan(5);
      expect(result.maxDrift).toBeLessThan(0.5);
      expect(result.moving).toBe(false);
      expect(result.feedback).toBe(true);
    });
  }
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`banished pile aligns above the grave with a matching hit area at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mdpro3Fixture(page);
    for (const controller of [0, 1]) {
      const banish = await page
        .locator(`[data-card-uuid="p${controller}-REMOVED-0"]`)
        .boundingBox();
      const grave = await page
        .locator(`[data-card-uuid="p${controller}-GRAVE-5"]`)
        .boundingBox();
      const hit = await page
        .locator(
          `[data-testid="duel-zone"][data-controller="${controller}"][data-zone="REMOVED"]`,
        )
        .boundingBox();
      expect(banish).not.toBeNull();
      expect(grave).not.toBeNull();
      expect(hit).not.toBeNull();
      expect(
        Math.abs(banish!.x + banish!.width / 2 - grave!.x - grave!.width / 2),
      ).toBeLessThan(1);
      expect(
        Math.abs(banish!.x + banish!.width / 2 - hit!.x - hit!.width / 2),
      ).toBeLessThan(1);
      expect(
        Math.abs(banish!.y + banish!.height / 2 - hit!.y - hit!.height / 2),
      ).toBeLessThan(1);
      expect(
        controller === 0
          ? banish!.y + banish!.height < grave!.y
          : grave!.y + grave!.height < banish!.y,
      ).toBe(true);
      expect(banish!.height).toBeGreaterThan(banish!.width);
    }
    if (viewport.width === 1440)
      await page.screenshot({
        path: "test-results/mdpro3-neos-flat-board.png",
      });
  });
}

test("battle awaits the complete attack and return before moving its target to the grave", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await fullMotion(page);
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { cardStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: handle } = await import("/src/service/duel/gameMsg.ts");
    const { attachPresentationMessage } = await import(
      "/src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/presentation.ts"
    );
    const attacker = cardStore.inner.find((c) => c.uuid === "p0-MZONE-2")!,
      target = cardStore.inner.find((c) => c.uuid === "p1-MZONE-2")!;
    const rect = () => {
      const r = document
        .querySelector('[data-card-uuid="p0-MZONE-2"]')!
        .getBoundingClientRect();
      return { x: r.x, y: r.y };
    };
    const origin = rect(),
      msg = new ygopro.StocGameMessage();
    attachPresentationMessage(msg, {
      kind: "battle",
      attacker: new ygopro.CardLocation(attacker.location.toObject()),
      target: new ygopro.CardLocation(target.location.toObject()),
      attackerAttack: 2500,
      attackerDefense: 2100,
      targetAttack: 2000,
      targetDefense: 2000,
    });
    const send = (m: any) =>
      handle(getUIContainer(), new ygopro.YgoStocMsg({ stoc_game_msg: m }));
    const start = performance.now();
    (window as any).__battleDone = false;
    void (async () => {
      await send(msg);
      (window as any).__battleStats = {
        elapsed: performance.now() - start,
        origin,
        returned: rect(),
      };
      await send(
        new ygopro.StocGameMessage({
          move: new ygopro.StocGameMessage.MsgMove({
            code: target.code,
            from: new ygopro.CardLocation(target.location.toObject()),
            to: new ygopro.CardLocation({
              controller: 1,
              zone: ygopro.CardZone.GRAVE,
              sequence: 6,
              position: ygopro.CardPosition.FACEUP_ATTACK,
            }),
            reason: 1,
          }),
        }),
      );
      (window as any).__battleDone = true;
    })();
  });
  await expect(page.locator('[data-card-uuid="p0-MZONE-2"]')).toHaveAttribute(
    "data-card-in-motion",
    "true",
  );
  await expect(page.locator('[data-card-uuid="p1-MZONE-2"]')).toHaveAttribute(
    "data-card-zone",
    "MZONE",
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__battleDone))
    .toBe(true);
  const result = await page.evaluate(() => (window as any).__battleStats);
  expect(result.elapsed).toBeGreaterThanOrEqual(1200);
  expect(result.elapsed).toBeLessThan(3000);
  expect(Math.abs(result.origin.x - result.returned.x)).toBeLessThan(1);
  expect(Math.abs(result.origin.y - result.returned.y)).toBeLessThan(1);
  await expect(page.locator('[data-card-uuid="p1-MZONE-2"]')).toHaveAttribute(
    "data-card-zone",
    "GRAVE",
  );
});

test("confirming a hidden opponent hand lists its public face without turning the field card", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await fullMotion(page);
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: confirm } = await import(
      "/src/service/duel/confirmCards.ts"
    );
    const Msg = ygopro.StocGameMessage.MsgConfirmCards;
    (window as any).__confirmDone = false;
    void confirm(
      getUIContainer(),
      new Msg({
        player: 1,
        cards: [
          new ygopro.CardInfo({
            code: 46986414,
            controller: 1,
            location: ygopro.CardZone.HAND,
            sequence: 0,
          }),
        ],
      }),
    ).then(() => ((window as any).__confirmDone = true));
  });
  const card = page.locator('[data-card-uuid="p1-HAND-0"]');
  await expect(page.getByTestId("duel-confirm-card")).toHaveAttribute(
    "data-card-code",
    "46986414",
  );
  await expect(card.locator("[data-card-face] img")).toHaveAttribute(
    "src",
    /card_back/,
  );
  await expect(card).toHaveAttribute("data-card-code", "0");
  await expect
    .poll(() => page.evaluate(() => (window as any).__confirmDone))
    .toBe(true);
  await expect(card).toHaveAttribute("data-card-code", "0");
  await expect(card.locator("[data-card-face] img")).toHaveAttribute(
    "src",
    /card_back/,
  );
});

test("field counters increment per click, reset on right click and send dense counts once", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: select } = await import(
      "/src/service/duel/selectCounter.ts"
    );
    const Msg = ygopro.StocGameMessage.MsgSelectCounter;
    void select(
      getUIContainer(),
      new Msg({
        player: 0,
        counter_type: 1,
        min: 3,
        options: [0, 1, 2].map(
          (sequence) =>
            new Msg.Info({
              code: 46986414,
              counter_count: 2,
              location: new ygopro.CardLocation({
                controller: 0,
                zone: ygopro.CardZone.MZONE,
                sequence,
              }),
            }),
        ),
      }),
    );
  });
  await expect(page.getByTestId("duel-counter-controls")).toBeVisible();
  await page.locator('[data-card-uuid="p0-MZONE-0"]').click();
  await expect(page.getByTestId("duel-counter-controls")).toContainText(
    "已选 1",
  );
  await page.mouse.click(640, 300, { button: "right" });
  await expect(page.getByTestId("duel-counter-controls")).toContainText(
    "已选 0",
  );
  await page.locator('[data-card-uuid="p0-MZONE-0"]').click();
  await page.locator('[data-card-uuid="p0-MZONE-0"]').click();
  await page.locator('[data-card-uuid="p0-MZONE-2"]').click();
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
  await page.getByTestId("duel-counter-submit").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__parityPackets.length))
    .toBe(1);
  const response = await page.evaluate(async () => {
    const { sendSelectCounterResponse } = await import("/src/api/index.ts");
    const expected: number[][] = [];
    sendSelectCounterResponse(
      { ws: { send: (p: Uint8Array) => expected.push([...p]) } } as any,
      [2, 0, 1],
    );
    return { expected, actual: (window as any).__parityPackets };
  });
  expect(response.actual).toEqual(response.expected);
  await expect(page.getByTestId("duel-counter-controls")).toHaveCount(0);
});

test("double tribute enables confirmation with one card while retaining the original response index", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: select } = await import(
      "/src/service/duel/selectTribute.ts"
    );
    const Msg = ygopro.StocGameMessage.MsgSelectTribute;
    void select(
      getUIContainer(),
      new Msg({
        player: 0,
        cancelable: true,
        min: 2,
        max: 2,
        selectable_cards: [0, 1, 2].map(
          (sequence) =>
            new Msg.Info({
              code: 46986414,
              level: sequence === 0 ? 2 : 1,
              response: sequence + 7,
              location: new ygopro.CardLocation({
                controller: 0,
                zone: ygopro.CardZone.MZONE,
                sequence,
              }),
            }),
        ),
      }),
    );
  });
  await expect(page.getByTestId("duel-select-card-submit")).toBeDisabled();
  await page.locator('[data-card-uuid="p0-MZONE-0"]').click();
  await expect(page.getByTestId("duel-select-card-submit")).toBeEnabled();
  await page.getByTestId("duel-select-card-submit").click();
  const response = await page.evaluate(async () => {
    const { sendSelectMultiResponse } = await import("/src/api/index.ts");
    const expected: number[][] = [];
    sendSelectMultiResponse(
      { ws: { send: (p: Uint8Array) => expected.push([...p]) } } as any,
      [7],
    );
    return { expected, actual: (window as any).__parityPackets };
  });
  expect(response.actual).toEqual(response.expected);
});

for (const kind of ["DICE", "COIN"] as const) {
  test(`${kind} shows all core results together and waits for the shared animation`, async ({
    page,
  }) => {
    await mdpro3Fixture(page);
    await fullMotion(page);
    await page.evaluate(async (kind) => {
      const { getUIContainer } = await import("/src/container/compat.ts");
      const { ygopro } = await import("/src/api/index.ts");
      const { default: toss } = await import("/src/service/duel/toss.ts");
      const Msg = ygopro.StocGameMessage.MsgToss;
      const start = performance.now();
      (window as any).__tossDone = false;
      void toss(
        getUIContainer(),
        new Msg({
          player: 0,
          toss_type: Msg.TossType[kind],
          res: kind === "DICE" ? [1, 6, 3] : [1, 0, 1],
        }),
      ).then(() => {
        (window as any).__tossElapsed = performance.now() - start;
        (window as any).__tossDone = true;
      });
    }, kind);
    const pieces = page
      .getByTestId("duel-toss-result")
      .locator("[data-result]");
    await expect(pieces).toHaveCount(3);
    expect(
      await pieces.evaluateAll((nodes) =>
        nodes.map((n) => Number(n.getAttribute("data-result"))),
      ),
    ).toEqual(kind === "DICE" ? [1, 6, 3] : [1, 0, 1]);
    expect(await page.evaluate(() => (window as any).__tossDone)).toBe(false);
    await expect
      .poll(() => page.evaluate(() => (window as any).__tossDone))
      .toBe(true);
    expect(
      await page.evaluate(() => (window as any).__tossElapsed),
    ).toBeGreaterThanOrEqual(kind === "DICE" ? 1950 : 2950);
  });
}

test("all six special summon categories reveal, land and reset without changing the board camera", async ({
  page,
}) => {
  test.setTimeout(45000);
  await mdpro3Fixture(page);
  await fullMotion(page);
  for (const [index, type] of [
    "fusion",
    "synchro",
    "xyz",
    "link",
    "ritual",
    "pendulum",
  ].entries()) {
    await page.evaluate(async (index) => {
      const { getUIContainer } = await import("/src/container/compat.ts");
      const { ygopro } = await import("/src/api/index.ts");
      const { presentGameMessage } = await import(
        "/src/ui/Duel/animation/present.ts"
      );
      const { default: handle } = await import("/src/service/duel/gameMsg.ts");
      const location = new ygopro.CardLocation({
        controller: 0,
        zone: ygopro.CardZone.MZONE,
        sequence: 2,
        position: ygopro.CardPosition.FACEUP_ATTACK,
      });
      // A material event records the public material identity before the summon.
      presentGameMessage(
        getUIContainer(),
        new ygopro.StocGameMessage({
          move: new ygopro.StocGameMessage.MsgMove({
            code: 46986414,
            from: location,
            to: new ygopro.CardLocation({
              controller: 0,
              zone: ygopro.CardZone.GRAVE,
              sequence: 7,
            }),
            reason: 8,
          }),
        }),
      );
      (window as any).__summonDone = false;
      void handle(
        getUIContainer(),
        new ygopro.YgoStocMsg({
          stoc_game_msg: new ygopro.StocGameMessage({
            sp_summoning: new ygopro.StocGameMessage.MsgSpSummoning({
              code: 110000001 + index,
              location,
            }),
          }),
        }),
      ).then(() => ((window as any).__summonDone = true));
    }, index);
    await expect(page.getByTestId("duel-summon-scene")).toHaveAttribute(
      "data-summon-type",
      type,
    );
    if (index === 0) {
      await expect(page.getByTestId("duel-card-reveal")).toHaveCSS(
        "opacity",
        "1",
      );
      await page.screenshot({ path: "test-results/mdpro3-neos-fusion.png" });
    }
    await expect
      .poll(() => page.evaluate(() => (window as any).__summonDone))
      .toBe(true);
    await expect(page.locator('[data-card-uuid="p0-MZONE-2"]')).toHaveAttribute(
      "data-card-in-motion",
      "false",
    );
  }
  await page.evaluate(async () => {
    const { resetDuelDialogs } = await import("/src/ui/Duel/Message/reset.ts");
    resetDuelDialogs();
  });
  await expect(page.getByTestId("duel-summon-scene")).toHaveCount(0);
  await expect(page.getByTestId("duel-event-effect")).toHaveCount(0);
});

test("LP floats before its linear roll and field attack values finish their 600ms roll", async ({
  page,
}) => {
  await page.clock.install();
  await mdpro3Fixture(page);
  await fullMotion(page);
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { cardStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: handle } = await import("/src/service/duel/gameMsg.ts");
    cardStore.inner.find((c) => c.uuid === "p0-MZONE-0")!.meta.data.atk = 3500;
    void handle(
      getUIContainer(),
      new ygopro.YgoStocMsg({
        stoc_game_msg: new ygopro.StocGameMessage({
          update_hp: new ygopro.StocGameMessage.MsgUpdateHp({
            player: 0,
            value: 2000,
            type_: ygopro.StocGameMessage.MsgUpdateHp.ActionType.DAMAGE,
          }),
        }),
      }),
    );
  });
  const lp = page.locator(
    '[data-testid="duel-player-life-value"][data-player="me"]',
  );
  await page.clock.runFor(650);
  await expect(lp).toHaveText("8000");
  await expect(
    page.locator(
      '[data-stats-card-uuid="p0-MZONE-0"] [data-stat-target="3500"]',
    ),
  ).toHaveText("3500");
  await page.clock.runFor(450);
  await expect(lp).toHaveText("8000");
  await page.clock.runFor(600);
  const middle = Number(await lp.innerText());
  expect(middle).toBeGreaterThan(6000);
  expect(middle).toBeLessThan(8000);
  await page.clock.runFor(800);
  await expect(lp).toHaveText("6000");
});

test("popup counters clamp to the remaining amount and keep unselected positions as zero", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { displayCheckCounterModal } = await import(
      "/src/ui/Duel/Message/CheckCounterModal/index.tsx"
    );
    void displayCheckCounterModal({
      min: 2,
      counterType: 1,
      options: [
        { code: 46986414, max: 2 },
        { code: 46986414, max: 2 },
        { code: 46986414, max: 2 },
      ],
    });
  });
  const inputs = page.getByRole("spinbutton");
  await expect(inputs).toHaveCount(3);
  await inputs.nth(0).fill("1");
  await inputs.nth(2).fill("9");
  await inputs.nth(2).press("Tab"); // InputNumber clamps an out-of-range edit on blur.
  expect(
    await page.evaluate(() => (window as any).__parityPackets.length),
  ).toBe(0);
  await page.getByTestId("duel-counter-submit").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__parityPackets.length))
    .toBe(1);
  const response = await page.evaluate(async () => {
    const { sendSelectCounterResponse } = await import("/src/api/index.ts");
    const expected: number[][] = [];
    sendSelectCounterResponse(
      { ws: { send: (p: Uint8Array) => expected.push([...p]) } } as any,
      [1, 0, 1],
    );
    return { expected, actual: (window as any).__parityPackets };
  });
  expect(response.actual).toEqual(response.expected);
});

test("reset during a summon releases the message without writing old summon history", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await fullMotion(page);
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { historyStore } = await import("/src/stores/index.ts");
    const { presentGameMessage } = await import(
      "/src/ui/Duel/animation/present.ts"
    );
    const { default: handle } = await import("/src/service/duel/gameMsg.ts");
    historyStore.historys = [];
    const location = new ygopro.CardLocation({
      controller: 0,
      zone: ygopro.CardZone.MZONE,
      sequence: 2,
      position: ygopro.CardPosition.FACEUP_ATTACK,
    });
    presentGameMessage(
      getUIContainer(),
      new ygopro.StocGameMessage({
        move: new ygopro.StocGameMessage.MsgMove({
          code: 46986414,
          from: location,
          to: new ygopro.CardLocation({
            controller: 0,
            zone: ygopro.CardZone.GRAVE,
            sequence: 7,
          }),
          reason: 8,
        }),
      }),
    );
    (window as any).__resetDone = false;
    void handle(
      getUIContainer(),
      new ygopro.YgoStocMsg({
        stoc_game_msg: new ygopro.StocGameMessage({
          sp_summoning: new ygopro.StocGameMessage.MsgSpSummoning({
            code: 110000001,
            location,
          }),
        }),
      }),
    ).then(() => ((window as any).__resetDone = true));
  });
  await expect(page.getByTestId("duel-summon-scene")).toBeVisible();
  await page.evaluate(async () => {
    const { resetDuelDialogs } = await import("/src/ui/Duel/Message/reset.ts");
    resetDuelDialogs();
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__resetDone))
    .toBe(true);
  expect(
    await page.evaluate(async () => {
      const { historyStore } = await import("/src/stores/index.ts");
      return historyStore.historys.length;
    }),
  ).toBe(0);
  await expect(page.getByTestId("duel-card-reveal")).toHaveCount(0);
  await expect(page.getByTestId("duel-event-effect")).toHaveCount(0);
});
