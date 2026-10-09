import { expect, type Page, test } from "@playwright/test";

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

async function beginFixtureChain(page: Page) {
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { cardStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: handleGameMsg } = await import(
      "/src/service/duel/gameMsg.ts"
    );
    const { duelTimeline } = await import("/src/ui/Duel/animation/runtime.ts");
    const card = cardStore.inner[0];
    await handleGameMsg(
      getUIContainer(),
      new ygopro.YgoStocMsg({
        stoc_game_msg: new ygopro.StocGameMessage({
          chaining: new ygopro.StocGameMessage.MsgChaining({
            code: card.code || 46986414,
            location: new ygopro.CardLocation(card.location.toObject()),
          }),
        }),
      }),
    );
    duelTimeline.clear();
  });
}

async function chainNotification(page: Page, command: number, index = 1) {
  await page.evaluate(
    async ({ command, index }) => {
      const { getUIContainer } = await import("/src/container/compat.ts");
      const { default: handleGameMsg } = await import(
        "/src/service/duel/gameMsg.ts"
      );
      const { default: GameMsgAdapter } = await import(
        "/src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/mod.ts"
      );
      const packet = new GameMsgAdapter({
        exData:
          command === 74
            ? Uint8Array.of(command)
            : Uint8Array.of(command, index),
      } as any).upcast();
      await handleGameMsg(getUIContainer(), packet);
    },
    { command, index },
  );
}

async function beginSpellChain(page: Page) {
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { cardStore } = await import("/src/stores/index.ts");
    const { genCard } = await import("/src/service/utils/index.ts");
    const { ygopro, fetchCard } = await import("/src/api/index.ts");
    const { default: handleGameMsg } = await import(
      "/src/service/duel/gameMsg.ts"
    );
    const { default: GameMsgAdapter } = await import(
      "/src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/mod.ts"
    );
    for (let index = 1; index <= 3; index++) {
      const code = 100000000 + index;
      cardStore.inner.push(
        genCard({
          ...cardStore.inner[0],
          uuid: `fixture-spell-${index}`,
          code,
          meta: fetchCard(code),
          location: new ygopro.CardLocation({
            controller: 0,
            zone: ygopro.CardZone.SZONE,
            sequence: index - 1,
            position: ygopro.CardPosition.FACEUP_ATTACK,
          }),
          idleInteractivities: [],
        }),
      );
      // Legacy YGOPro: CHAINING, uint32 code, controller/zone/sequence/position.
      const bytes = new Uint8Array(9);
      bytes[0] = 70;
      new DataView(bytes.buffer).setUint32(1, code, true);
      bytes.set([0, 8, index - 1, 1], 5);
      await handleGameMsg(
        getUIContainer(),
        new GameMsgAdapter({ exData: bytes } as any).upcast(),
      );
      await handleGameMsg(
        getUIContainer(),
        new GameMsgAdapter({
          exData: Uint8Array.of(71, index),
        } as any).upcast(),
      );
    }
  });
  await expect(page.getByTestId("duel-chain-entry")).toHaveCount(3);
}

for (const mode of ["full", "lite"] as const) {
  test(`${mode}: live resolution immediately replaces queued activations and follows reverse engine order`, async ({
    page,
  }) => {
    await duelFixture(page);
    await beginSpellChain(page);
    await page.evaluate(async (mode) => {
      const { animationSettings } = await import(
        "/src/ui/Duel/animation/runtime.ts"
      );
      animationSettings.mode = mode;
    }, mode);
    const reveal = page.getByTestId("duel-card-reveal");
    await chainNotification(page, 72, 3);
    await expect(reveal).toHaveAttribute("data-chain-index", "3");
    await expect(reveal).toHaveAttribute("data-effect-kind", "resolve");
    await expect(reveal).toHaveAttribute("data-effect-live", "true");
    // A link waiting on further engine messages must outlive the old 850 ms cut-in.
    await page.waitForTimeout(1100);
    await expect(reveal).toBeVisible();
    expect(
      await reveal.evaluate((node) => getComputedStyle(node).opacity),
    ).toBe("1");
    for (const index of [3, 2, 1]) {
      if (index !== 3) await chainNotification(page, 72, index);
      await expect(reveal).toHaveAttribute("data-chain-index", `${index}`);
      await expect(reveal).toHaveAttribute(
        "data-card-code",
        `${100000000 + index}`,
      );
      // Use the link index rather than its position in the reverse resolution order.
      await expect(
        page.locator(
          `[data-testid="duel-chain-entry"][data-chain-index="${index}"]`,
        ),
      ).toHaveAttribute("data-chain-resolving", "true");
      await chainNotification(page, 73, index);
      await expect(reveal).toHaveCount(0);
      await expect(
        page.locator(
          `[data-testid="duel-chain-entry"][data-chain-index="${index}"]`,
        ),
      ).toHaveAttribute("data-chain-resolved", "true");
    }
    await chainNotification(page, 74);
    await expect(page.getByTestId("duel-chain-stack")).not.toContainText(
      "结算中",
    );
  });
}

test("batched chain completion and spell cleanup leave only final history and cannot replay old resolution", async ({
  page,
}) => {
  await duelFixture(page);
  await beginSpellChain(page);
  await chainNotification(page, 72, 3);
  await expect(
    page.locator('[data-testid="duel-chain-entry"][data-chain-index="3"]'),
  ).toContainText("结算中");
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { default: handleGameMsg } = await import(
      "/src/service/duel/gameMsg.ts"
    );
    const { default: GameMsgAdapter } = await import(
      "/src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/mod.ts"
    );
    const send = (bytes: Uint8Array) =>
      handleGameMsg(
        getUIContainer(),
        new GameMsgAdapter({ exData: bytes } as any).upcast(),
      );
    // Complete all remaining links in one browser task, then clean up the spells.
    for (const index of [3, 2, 1]) {
      if (index !== 3) await send(Uint8Array.of(72, index));
      await send(Uint8Array.of(73, index));
    }
    await send(Uint8Array.of(74));
    for (let index = 1; index <= 3; index++) {
      const bytes = new Uint8Array(17);
      bytes[0] = 50;
      new DataView(bytes.buffer).setUint32(1, 100000000 + index, true);
      bytes.set([0, 8, index - 1, 1, 0, 16, 0, 1], 5);
      await send(bytes);
    }
  });
  for (let index = 1; index <= 3; index++)
    await expect(
      page.locator(`[data-card-uuid="fixture-spell-${index}"]`),
    ).toHaveAttribute("data-card-zone", "GRAVE");
  const entries = page.getByTestId("duel-chain-entry");
  await expect(entries).toHaveCount(3);
  for (const entry of await entries.all()) {
    await expect(entry).toHaveAttribute("data-chain-resolved", "true");
    await expect(entry).toHaveAttribute("data-chain-resolving", "false");
    await expect(entry).toContainText("已处理");
  }
  await expect(page.getByTestId("duel-card-reveal")).toHaveCount(0);
  // A new chain reuses CHAIN 1 while the previous history's expiry is still pending.
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { default: handleGameMsg } = await import(
      "/src/service/duel/gameMsg.ts"
    );
    const { default: GameMsgAdapter } = await import(
      "/src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/mod.ts"
    );
    const bytes = new Uint8Array(9);
    bytes[0] = 70;
    new DataView(bytes.buffer).setUint32(1, 100000003, true);
    bytes.set([0, 16, 0, 1], 5);
    await handleGameMsg(
      getUIContainer(),
      new GameMsgAdapter({ exData: bytes } as any).upcast(),
    );
  });
  await chainNotification(page, 72, 1);
  await page.waitForTimeout(1600);
  await expect(entries).toHaveCount(1);
  await expect(entries).toContainText("结算中");
  await expect(page.getByTestId("duel-card-reveal")).toHaveAttribute(
    "data-card-code",
    "100000003",
  );
  await chainNotification(page, 73, 1);
  await chainNotification(page, 74);
  await expect(entries).toContainText("已处理");
  await expect(page.getByTestId("duel-card-reveal")).toHaveCount(0);
  await expect(entries).toHaveCount(0);
  await expect(page.getByTestId("duel-card-reveal")).toHaveCount(0);
});

test("a card moving to the grave during its effect does not prematurely finish the live resolution", async ({
  page,
}) => {
  await duelFixture(page);
  await beginFixtureChain(page);
  await chainNotification(page, 72);
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { default: handleGameMsg } = await import(
      "/src/service/duel/gameMsg.ts"
    );
    const { default: GameMsgAdapter } = await import(
      "/src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/mod.ts"
    );
    const bytes = new Uint8Array(17);
    bytes[0] = 50;
    new DataView(bytes.buffer).setUint32(1, 46986414, true);
    bytes.set([0, 4, 2, 1, 0, 16, 0, 1], 5);
    await handleGameMsg(
      getUIContainer(),
      new GameMsgAdapter({ exData: bytes } as any).upcast(),
    );
  });
  await expect(
    page.locator('[data-card-uuid="fixture-monster"]'),
  ).toHaveAttribute("data-card-zone", "GRAVE");
  await expect(page.getByTestId("duel-card-reveal")).toHaveAttribute(
    "data-effect-kind",
    "resolve",
  );
  await expect(page.getByTestId("duel-chain-entry")).toContainText("结算中");
  await chainNotification(page, 73);
  await expect(page.getByTestId("duel-card-reveal")).toHaveCount(0);
  await chainNotification(page, 74);
  await expect(page.getByTestId("duel-chain-entry")).toContainText("已处理");
});

async function updateFixtureStatus(page: Page, status: number) {
  await page.evaluate(async (status) => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { default: handleGameMsg } = await import(
      "/src/service/duel/gameMsg.ts"
    );
    const { default: GameMsgAdapter } = await import(
      "/src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/mod.ts"
    );
    // MSG_UPDATE_CARD: controller 0, raw MZONE 0x04, sequence 2, QUERY_STATUS.
    const bytes = new Uint8Array(16);
    bytes.set([7, 0, 4, 2]);
    const view = new DataView(bytes.buffer);
    view.setUint32(4, 12, true);
    view.setUint32(8, 0x80000, true);
    view.setUint32(12, status, true);
    await handleGameMsg(
      getUIContainer(),
      new GameMsgAdapter({ exData: bytes } as any).upcast(),
    );
  }, status);
}

test("activation negation greys the original card, cancels its cut-in and keeps commands usable", async ({
  page,
}) => {
  await duelFixture(page);
  await beginFixtureChain(page);
  await page.evaluate(async () => {
    const { animationSettings } = await import(
      "/src/ui/Duel/animation/runtime.ts"
    );
    animationSettings.mode = "full";
  });
  await chainNotification(page, 72);
  await expect(page.getByTestId("duel-card-reveal")).toBeVisible();
  await chainNotification(page, 75);
  const card = page.locator('[data-card-uuid="fixture-monster"]');
  const face = card.locator("[data-card-face]");
  await expect(card).toHaveAttribute("data-card-negation", "activation");
  await expect(card).toHaveAttribute("data-card-disabled", "false");
  await expect
    .poll(() => face.evaluate((node) => getComputedStyle(node).filter))
    .toBe("grayscale(1)");
  await expect(page.getByTestId("duel-card-reveal")).toHaveCount(0);
  await expect(page.getByTestId("duel-card-negation")).toHaveCount(0);
  await expect(page.getByTestId("duel-chain-entry")).not.toContainText("无效");
  const token = await card.getAttribute("data-card-negating");
  await chainNotification(page, 76);
  await expect(card).toHaveAttribute("data-card-negating", token!);
  await card.click();
  await page.getByTestId("duel-action-attack").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__mdPackets.length))
    .toBe(1);
  await expect(card).not.toHaveAttribute("data-card-negating", /.+/);
  await expect
    .poll(() => face.evaluate((node) => getComputedStyle(node).filter))
    .toBe("none");
});

test("persistent disable greys only face-up field cards and restores the face on a status update", async ({
  page,
}) => {
  await duelFixture(page);
  const card = page.locator('[data-card-uuid="fixture-monster"]');
  const face = card.locator("[data-card-face]");
  await updateFixtureStatus(page, 1);
  await expect(card).toHaveAttribute("data-card-disabled", "true");
  await expect
    .poll(() => face.evaluate((node) => getComputedStyle(node).filter))
    .toBe("grayscale(1)");
  await expect(face.locator('img[src*="disabled.png"]')).toHaveCount(0);
  await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    cardStore.inner[0].location.position = ygopro.CardPosition.FACEDOWN_DEFENSE;
  });
  await expect(card).toHaveAttribute("data-card-disabled", "false");
  await expect
    .poll(() => face.evaluate((node) => getComputedStyle(node).filter))
    .toBe("none");
  await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    cardStore.inner[0].location.position = ygopro.CardPosition.FACEUP_DEFENSE;
  });
  await expect(card).toHaveAttribute("data-card-disabled", "true");
  await updateFixtureStatus(page, 0);
  await expect(card).toHaveAttribute("data-card-disabled", "false");
  await expect
    .poll(() => face.evaluate((node) => getComputedStyle(node).filter))
    .toBe("none");
});

test("opponent hand negation briefly turns the public source face up and returns to its hidden pose", async ({
  page,
}) => {
  await duelFixture(page);
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { cardStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: handleGameMsg } = await import(
      "/src/service/duel/gameMsg.ts"
    );
    const card = cardStore.inner[0];
    await handleGameMsg(
      getUIContainer(),
      new ygopro.YgoStocMsg({
        stoc_game_msg: new ygopro.StocGameMessage({
          move: new ygopro.StocGameMessage.MsgMove({
            code: 0,
            from: new ygopro.CardLocation(card.location.toObject()),
            to: new ygopro.CardLocation({
              controller: 1,
              zone: ygopro.CardZone.HAND,
              sequence: 0,
              position: ygopro.CardPosition.FACEDOWN_ATTACK,
            }),
            reason: 0,
          }),
        }),
      }),
    );
  });
  await beginFixtureChain(page);
  await expect(page.getByTestId("duel-chain-entry")).toHaveAttribute(
    "data-chain-code",
    "46986414",
  );
  await page.evaluate(async () => {
    const { animationSettings } = await import(
      "/src/ui/Duel/animation/runtime.ts"
    );
    animationSettings.mode = "full";
  });
  await chainNotification(page, 75);
  const card = page.locator('[data-card-uuid="fixture-monster"]');
  await expect(card.locator("[data-card-face] img")).toHaveAttribute(
    "src",
    /46986414/,
  );
  await expect(card).toHaveAttribute("data-card-code", "0");
  await expect(card).toHaveAttribute("data-card-negation", "activation");
  const wrap = card.locator("[data-card-negation-wrap]");
  await expect
    .poll(() => wrap.evaluate((node) => getComputedStyle(node).transform))
    .not.toBe("none");
  await expect
    .poll(() =>
      card.evaluate((node) =>
        Number.parseFloat((node as HTMLElement).style.getPropertyValue("--ry")),
      ),
    )
    .toBe(180);
  await expect(page.getByTestId("duel-card-reveal")).toHaveCount(0);
  await expect(card).not.toHaveAttribute("data-card-negating", /.+/);
  await expect
    .poll(() => wrap.evaluate((node) => getComputedStyle(node).transform))
    .toBe("none");
  await expect(card).toHaveAttribute("data-card-code", "0");
});

test("effect negation follows the same card after movement and reset removes its feedback", async ({
  page,
}) => {
  await duelFixture(page);
  await beginFixtureChain(page);
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { cardStore } = await import("/src/stores/index.ts");
    const { genCard } = await import("/src/service/utils/index.ts");
    const { ygopro, fetchCard } = await import("/src/api/index.ts");
    const { default: handleGameMsg } = await import(
      "/src/service/duel/gameMsg.ts"
    );
    const card = cardStore.inner[0];
    const other = genCard({
      ...card,
      uuid: "other-copy",
      meta: fetchCard(card.code),
      location: new ygopro.CardLocation({
        ...card.location.toObject(),
        sequence: 4,
      }),
      idleInteractivities: [],
    });
    cardStore.inner.push(other);
    await handleGameMsg(
      getUIContainer(),
      new ygopro.YgoStocMsg({
        stoc_game_msg: new ygopro.StocGameMessage({
          move: new ygopro.StocGameMessage.MsgMove({
            code: card.code,
            from: new ygopro.CardLocation(card.location.toObject()),
            to: new ygopro.CardLocation({
              ...card.location.toObject(),
              sequence: 3,
            }),
            reason: 0,
          }),
        }),
      }),
    );
  });
  await chainNotification(page, 76);
  const card = page.locator('[data-card-uuid="fixture-monster"]');
  await expect(card).toHaveAttribute("data-card-sequence", "3");
  await expect(card).toHaveAttribute("data-card-negation", "effect");
  await expect(
    page.locator('[data-card-uuid="other-copy"]'),
  ).not.toHaveAttribute("data-card-negating", /.+/);
  await page.evaluate(async () => {
    const { duelTimeline } = await import("/src/ui/Duel/animation/runtime.ts");
    duelTimeline.clear();
  });
  await expect(card).not.toHaveAttribute("data-card-negating", /.+/);
  await expect(page.getByTestId("duel-card-reveal")).toHaveCount(0);
});

test("negating a card returned deep into the deck shows its public identity at the pile", async ({
  page,
}) => {
  await duelFixture(page);
  await beginFixtureChain(page);
  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { cardStore } = await import("/src/stores/index.ts");
    const { genCard } = await import("/src/service/utils/index.ts");
    const { ygopro, fetchCard } = await import("/src/api/index.ts");
    const { default: handleGameMsg } = await import(
      "/src/service/duel/gameMsg.ts"
    );
    const card = cardStore.inner[0];
    for (let sequence = 0; sequence < 5; sequence++) {
      cardStore.inner.push(
        genCard({
          ...card,
          uuid: `deck-cover-${sequence}`,
          meta: fetchCard(card.code),
          location: new ygopro.CardLocation({
            ...card.location.toObject(),
            zone: ygopro.CardZone.DECK,
            sequence,
          }),
          idleInteractivities: [],
        }),
      );
    }
    await handleGameMsg(
      getUIContainer(),
      new ygopro.YgoStocMsg({
        stoc_game_msg: new ygopro.StocGameMessage({
          move: new ygopro.StocGameMessage.MsgMove({
            code: card.code,
            from: new ygopro.CardLocation(card.location.toObject()),
            to: new ygopro.CardLocation({
              ...card.location.toObject(),
              zone: ygopro.CardZone.DECK,
              sequence: 0,
            }),
            reason: 0,
          }),
        }),
      }),
    );
  });
  await expect(page.locator('[data-card-uuid="fixture-monster"]')).toBeHidden();
  await chainNotification(page, 76);
  const feedback = page.getByTestId("duel-card-negation");
  await expect(feedback).toBeVisible();
  await expect(feedback).toHaveAttribute("data-card-code", "46986414");
  await expect(feedback).toHaveAttribute("data-card-negation", "effect");
  await expect(
    page.locator('[data-card-uuid="deck-cover-4"]'),
  ).not.toHaveAttribute("data-card-negating", /.+/);
  await expect(page.getByTestId("duel-card-reveal")).toHaveCount(0);
  const at = await feedback.boundingBox();
  const pile = await page
    .locator('[data-card-uuid="deck-cover-4"]')
    .boundingBox();
  expect(
    Math.hypot(
      at!.x + at!.width / 2 - pile!.x - pile!.width / 2,
      at!.y + at!.height / 2 - pile!.y - pile!.height / 2,
    ),
  ).toBeLessThan(120);
});

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
