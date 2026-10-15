import { expect, type Page } from "@playwright/test";

import { installOfflineDuelResources } from "./offlineDuel";

export async function mdpro3Fixture(page: Page, hands = 5) {
  await installOfflineDuelResources(page);
  await page.goto("/");
  await page.waitForFunction(async () => {
    const { initStore } = await import("/src/stores/index.ts");
    return initStore.sqlite.progress === 1 && initStore.i18n;
  });
  await page.evaluate(async (hands) => {
    const { initUIContainer } = await import("/src/container/compat.ts");
    const { cardStore, matStore, roomStore } = await import(
      "/src/stores/index.ts"
    );
    const { genCard } = await import("/src/service/utils/index.ts");
    const { ygopro, fetchCard } = await import("/src/api/index.ts");
    const { DECK, EXTRA, HAND, MZONE, SZONE, GRAVE, REMOVED } = ygopro.CardZone;
    const { FACEUP_ATTACK, FACEUP_DEFENSE, FACEDOWN } = ygopro.CardPosition;
    const { animationSettings } = await import(
      "/src/ui/Duel/animation/runtime.ts"
    );
    const packets: number[][] = [];
    (window as any).__parityPackets = packets;
    initUIContainer({
      ws: { send: (bytes: Uint8Array) => packets.push([...bytes]) },
    } as any);
    animationSettings.mode = "off";
    matStore.selfType = 1;
    matStore.currentPlayer = 0;
    matStore.turnCount = 3;
    matStore.initInfo.set(0, { life: 8000 });
    matStore.initInfo.set(1, { life: 7200 });
    matStore.phase.currentPhase =
      ygopro.StocGameMessage.MsgNewPhase.PhaseType.MAIN1;
    matStore.phase.enableBp = true;
    matStore.phase.enableEp = true;
    matStore.commandSource = "idle";
    matStore.commandPlayer = 0;
    roomStore.players = [
      { name: "Player", isMe: true, state: 0 },
      { name: "Opponent", state: 0 },
    ];
    cardStore.inner = [];
    const add = (
      controller: number,
      zone: number,
      sequence: number,
      code = 46986414,
      position = FACEUP_ATTACK,
    ) => {
      const card = genCard({
        uuid: `p${controller}-${ygopro.CardZone[zone]}-${sequence}`,
        code,
        meta: code ? fetchCard(code) : { id: 0, data: {}, text: {} },
        location: new ygopro.CardLocation({
          controller,
          zone,
          sequence,
          position,
        }),
        counters: {},
        status: 0,
        isToken: false,
        targeted: false,
        selectInfo: { selectable: false, selected: false },
        idleInteractivities: [],
      });
      cardStore.inner.push(card);
      return card;
    };
    for (let controller = 0; controller <= 1; controller++) {
      for (let i = 0; i < 35; i++) add(controller, DECK, i, 0, FACEDOWN);
      for (let i = 0; i < 7; i++)
        add(controller, EXTRA, i, controller ? 0 : 46986414, FACEDOWN);
      for (let i = 0; i < hands; i++)
        add(controller, HAND, i, controller ? 0 : 46986414, FACEUP_ATTACK);
      for (let i = 0; i < 3; i++)
        add(
          controller,
          MZONE,
          i,
          46986414,
          i === 1 ? FACEUP_DEFENSE : FACEUP_ATTACK,
        );
      for (let i = 0; i < 3; i++)
        add(
          controller,
          SZONE,
          i,
          46986414,
          controller ? FACEDOWN : FACEUP_ATTACK,
        );
      for (let i = 0; i < 6; i++) add(controller, GRAVE, i);
      add(
        controller,
        REMOVED,
        0,
        controller ? 0 : 46986414,
        controller ? FACEDOWN : FACEUP_ATTACK,
      );
    }
    cardStore.at(HAND, 0, 0)!.idleInteractivities = [
      { interactType: 1, response: 0, responseSource: "idle" },
      { interactType: 6, response: 5, responseSource: "idle" },
    ];
    history.pushState({}, "", "/duel");
    dispatchEvent(new PopStateEvent("popstate"));
  }, hands);
  await expect(page.getByTestId("duel-stage")).toBeVisible();
  await expect(page.locator('[data-card-uuid="p0-MZONE-2"]')).toHaveAttribute(
    "data-card-in-motion",
    "false",
  );
}
