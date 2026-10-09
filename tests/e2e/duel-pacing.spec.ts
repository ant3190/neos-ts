import { expect, type Page, test } from "@playwright/test";

import { installOfflineDuelResources } from "./helpers/offlineDuel";

async function pacingFixture(page: Page, mode = "off") {
  await installOfflineDuelResources(page);
  await page.goto("/");
  await page.waitForFunction(async () => {
    const { initStore } = await import("/src/stores/index.ts");
    return initStore.sqlite.progress === 1 && initStore.i18n;
  });
  await page.evaluate(async (mode) => {
    const { initUIContainer } = await import("/src/container/compat.ts");
    const { cardStore, matStore } = await import("/src/stores/index.ts");
    const { genCard } = await import("/src/service/utils/index.ts");
    const { ygopro, fetchCard } = await import("/src/api/index.ts");
    const { animationSettings } = await import(
      "/src/ui/Duel/animation/runtime.ts"
    );
    animationSettings.mode = mode as any;
    const packets: number[][] = [];
    (window as any).__pacePackets = packets;
    initUIContainer({
      ws: { send: (packet: Uint8Array) => packets.push([...packet]) },
    } as any);
    matStore.selfType = 1;
    matStore.currentPlayer = 0;
    matStore.initInfo.set(0, { life: 8000 });
    matStore.initInfo.set(1, { life: 8000 });
    matStore.phase.currentPhase =
      ygopro.StocGameMessage.MsgNewPhase.PhaseType.MAIN1;
    cardStore.inner = Array.from({ length: 4 }, (_, index) => {
      const deck = index >= 2;
      const code = deck ? 0 : 100000001 + index;
      return genCard({
        uuid: `pace-card-${index}`,
        code,
        meta: fetchCard(code),
        location: new ygopro.CardLocation({
          controller: 0,
          zone: deck ? ygopro.CardZone.DECK : ygopro.CardZone.SZONE,
          sequence: deck ? index - 2 : index,
          position: deck
            ? ygopro.CardPosition.FACEDOWN_ATTACK
            : ygopro.CardPosition.FACEUP_ATTACK,
        }),
        counters: {},
        isToken: false,
        targeted: false,
        selectInfo: { selectable: false, selected: false },
        status: 0,
        idleInteractivities: [],
      });
    });
    history.pushState({}, "", "/duel");
    dispatchEvent(new PopStateEvent("popstate"));
  }, mode);
  await expect(page.locator('[data-card-uuid="pace-card-0"]')).toBeVisible();
}

test("batched engine actions leave reading beats and chain completion immediately follows the actual effect", async ({
  page,
}) => {
  // Keep engine timing deterministic without counting Chromium's render/GC work.
  const timeOrigin = new Date("2026-10-09T00:00:00Z");
  await page.clock.install({ time: timeOrigin });
  await pacingFixture(page);
  await page.clock.pauseAt(new Date(timeOrigin.getTime() + 60_000));
  await page.evaluate(async () => {
    const { subscribe } = await import("/node_modules/.vite/deps/valtio.js");
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { cardStore, matStore } = await import("/src/stores/index.ts");
    const { duelTimeline } = await import("/src/ui/Duel/animation/runtime.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: handleSocketMessage } = await import(
      "/src/service/onSocketMessage.ts"
    );
    const trace: { event: string; time: number }[] = [];
    const seen = new Set<string>();
    const record = (event: string) => {
      if (!seen.has(event)) {
        seen.add(event);
        trace.push({ event, time: performance.now() });
      }
    };
    const subscriptions = [
      subscribe(
        matStore,
        () => {
          for (const entry of matStore.chainDetails) {
            record(`activate-${entry.index}`);
            if (entry.resolving) record(`resolve-${entry.index}`);
            if (entry.resolved) record(`solved-${entry.index}`);
          }
          if (seen.has("activate-2") && matStore.chainDetails.length === 0)
            record("end");
          if (matStore.phase.enableEp) record("input");
        },
        true,
      ),
      subscribe(
        cardStore,
        () => {
          if (cardStore.inner[1].location.zone === ygopro.CardZone.GRAVE)
            record("grave");
        },
        true,
      ),
      duelTimeline.subscribe(() => {
        if (duelTimeline.getSnapshot().reveal?.kind === "chain") record("pair");
      }),
    ];
    const frame = (data: Uint8Array) => {
      const packet = new Uint8Array(data.length + 3);
      new DataView(packet.buffer).setUint16(0, data.length + 1, true);
      packet[2] = 1;
      packet.set(data, 3);
      return packet;
    };
    const activation = (code: number, sequence: number) => {
      const data = new Uint8Array(9);
      data[0] = 70;
      new DataView(data.buffer).setUint32(1, code, true);
      data.set([0, 8, sequence, 1], 5);
      return data;
    };
    const move = new Uint8Array(17);
    move[0] = 50;
    new DataView(move.buffer).setUint32(1, 100000002, true);
    move.set([0, 8, 1, 1, 0, 16, 0, 1], 5);
    const packets = [
      activation(100000001, 0),
      Uint8Array.of(71, 1),
      activation(100000002, 1),
      Uint8Array.of(71, 2),
      Uint8Array.of(72, 2),
      move,
      Uint8Array.of(73, 2),
      Uint8Array.of(72, 1),
      Uint8Array.of(73, 1),
      Uint8Array.of(74),
      Uint8Array.of(11, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0),
    ].map(frame);
    const bytes = new Uint8Array(
      packets.reduce((sum, packet) => sum + packet.length, 0),
    );
    let offset = 0;
    for (const packet of packets) {
      bytes.set(packet, offset);
      offset += packet.length;
    }
    (window as any).__paceTrace = trace;
    (window as any).__paceDone = false;
    void handleSocketMessage(
      getUIContainer(),
      new MessageEvent("message", { data: bytes.buffer }),
    ).then(() => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
      (window as any).__paceDone = true;
    });
  });
  await page.clock.runFor(1200);
  await expect(page.getByTestId("duel-card-reveal")).toHaveAttribute(
    "data-effect-kind",
    "chain",
  );
  await page.clock.runFor(1600);
  await expect
    .poll(() => page.evaluate(() => (window as any).__paceDone))
    .toBe(true);
  const trace: { event: string; time: number }[] = await page.evaluate(
    () => (window as any).__paceTrace,
  );
  expect(trace.map((entry) => entry.event)).toEqual([
    "activate-1",
    "activate-2",
    "pair",
    "resolve-2",
    "grave",
    "solved-2",
    "resolve-1",
    "solved-1",
    "end",
    "input",
  ]);
  const time = Object.fromEntries(
    trace.map((entry) => [entry.event, entry.time]),
  );
  expect(time["activate-2"] - time["activate-1"]).toBeGreaterThanOrEqual(550);
  expect(time["pair"] - time["activate-2"]).toBeGreaterThanOrEqual(550);
  expect(time["resolve-2"] - time["pair"]).toBeGreaterThanOrEqual(280);
  expect(time["grave"] - time["resolve-2"]).toBeGreaterThanOrEqual(200);
  expect(time["solved-1"] - time["resolve-1"]).toBeGreaterThanOrEqual(200);
  expect(time["resolve-1"] - time["solved-2"]).toBeLessThan(80);
  expect(time["input"] - time["end"]).toBeLessThan(80);
  await expect(page.getByTestId("duel-card-reveal")).toHaveCount(0);
  await expect(page.locator('[data-card-uuid="pace-card-1"]')).toHaveAttribute(
    "data-card-zone",
    "GRAVE",
  );
  await page.clock.resume();
  await page.getByTestId("duel-phase-select").click();
  await page.getByTestId("duel-phase-end").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__pacePackets.length))
    .toBe(1);
});

for (const mode of ["full", "lite"]) {
  test(`${mode}: drawing and playing a card remains readable with the art visible and bounded waits`, async ({
    page,
  }) => {
    await pacingFixture(page, mode);
    const times = await page.evaluate(async () => {
      const { getUIContainer } = await import("/src/container/compat.ts");
      const { ygopro } = await import("/src/api/index.ts");
      const { cardStore } = await import("/src/stores/index.ts");
      const { default: handleGameMsg } = await import(
        "/src/service/duel/gameMsg.ts"
      );
      const send = (data: any) =>
        handleGameMsg(
          getUIContainer(),
          new ygopro.YgoStocMsg({
            stoc_game_msg: new ygopro.StocGameMessage(data),
          }),
        );
      const drawStart = performance.now();
      await send({
        draw: new ygopro.StocGameMessage.MsgDraw({
          player: 0,
          cards: [46986414],
        }),
      });
      const drawEnd = performance.now();
      const card = cardStore.inner.find(
        (entry) => entry.uuid === "pace-card-3",
      )!;
      await send({
        move: new ygopro.StocGameMessage.MsgMove({
          code: 46986414,
          from: new ygopro.CardLocation(card.location.toObject()),
          to: new ygopro.CardLocation({
            controller: 0,
            zone: ygopro.CardZone.MZONE,
            sequence: 2,
            position: ygopro.CardPosition.FACEUP_ATTACK,
          }),
          reason: 0,
        }),
      });
      return { draw: drawEnd - drawStart, move: performance.now() - drawEnd };
    });
    expect(times.draw).toBeGreaterThanOrEqual(350);
    expect(times.move).toBeGreaterThanOrEqual(280);
    expect(times.draw).toBeLessThan(1800);
    expect(times.move).toBeLessThan(1800);
    const card = page.locator('[data-card-uuid="pace-card-3"]');
    await expect(card).toHaveAttribute("data-card-zone", "MZONE");
    await expect(card.locator("[data-card-face] img")).toHaveAttribute(
      "src",
      /46986414/,
    );
  });
}

test("paused replay steps bypass reading beats; playback pauses only at visible phase transitions", async ({
  page,
}) => {
  await pacingFixture(page);
  const times = await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { replayStore } = await import("/src/stores/index.ts");
    const { default: handleGameMsg } = await import(
      "/src/service/duel/gameMsg.ts"
    );
    const sendPhase = (phase: number) =>
      handleGameMsg(
        getUIContainer(),
        new ygopro.YgoStocMsg({
          stoc_game_msg: new ygopro.StocGameMessage({
            new_phase: new ygopro.StocGameMessage.MsgNewPhase({
              phase_type: phase,
            }),
          }),
        }),
      );
    const phases = ygopro.StocGameMessage.MsgNewPhase.PhaseType;
    replayStore.isReplay = true;
    replayStore.paused = true;
    const start = performance.now();
    await sendPhase(phases.MAIN1);
    const stepped = performance.now();
    replayStore.paused = false;
    await sendPhase(phases.BATTLE_START);
    const playing = performance.now();
    await sendPhase(phases.BATTLE_STEP);
    return {
      step: stepped - start,
      playing: playing - stepped,
      internal: performance.now() - playing,
    };
  });
  expect(times.step).toBeLessThan(100);
  expect(times.playing).toBeGreaterThanOrEqual(280);
  expect(times.playing).toBeLessThan(1000);
  expect(times.internal).toBeLessThan(100);
});
