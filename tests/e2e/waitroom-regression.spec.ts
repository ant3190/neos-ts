import { expect, test } from "@playwright/test";

test("loads and changes decks, then shows the correct hands during guessing", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(async () => {
    const { initStore } = await import("/src/stores/index.ts");
    return initStore.decks;
  });

  await page.evaluate(async () => {
    const { initUIContainer } = await import("/src/container/compat.ts");
    const { deckStore, roomStore } = await import("/src/stores/index.ts");
    const packets: number[][] = [];
    (window as any).__waitroomPackets = packets;
    initUIContainer({
      ws: { send: (packet: Uint8Array) => packets.push([...packet]) },
    } as any);
    roomStore.players = [
      { name: "Me", isMe: true, state: 3 },
      { name: "Opponent", isMe: false, state: 3 },
    ];
    roomStore.isHost = true;
    // Exercise the common case where the room appears before its decks load.
    deckStore.decks = [];
    history.pushState({}, "", "/waitroom");
    dispatchEvent(new PopStateEvent("popstate"));
  });

  const select = page.getByTestId("waitroom-deck-select");
  await expect(select).toBeVisible();
  await expect(select).toHaveClass(/ant-select-disabled/);

  await page.evaluate(async () => {
    const { deckStore } = await import("/src/stores/index.ts");
    deckStore.decks = [
      { deckName: "Deck A", main: [12345], extra: [], side: [] },
      { deckName: "Deck B", main: [67890], extra: [], side: [] },
    ];
  });
  await expect(select).toContainText("Deck A");
  await expect(select).not.toHaveClass(/ant-select-disabled/);
  await select.click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option", {
      hasText: "Deck B",
    })
    .click();
  await expect(select).toContainText("Deck B");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const packets: number[][] = (window as any).__waitroomPackets;
        return packets.some((packet) => {
          const view = new DataView(new Uint8Array(packet).buffer);
          return (
            packet[2] === 2 &&
            packet.length === view.getUint16(0, true) + 2 &&
            view.getUint32(11, true) === 67890
          );
        });
      }),
    )
    .toBe(true);

  await page.evaluate(async () => {
    const { roomStore, RoomStage } = await import("/src/stores/index.ts");
    roomStore.stage = RoomStage.HAND_SELECTING;
  });
  await expect(page.getByTestId("waitroom-mora-scissors")).toBeVisible();
  await expect(select).toHaveClass(/ant-select-disabled/);
  await page.getByTestId("waitroom-mora-scissors").click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const packets: number[][] = (window as any).__waitroomPackets;
        return packets.findLast((packet) => packet[2] === 3)?.[3];
      }),
    )
    .toBe(1);

  for (const [choice, byte] of [
    ["rock", 2],
    ["paper", 3],
  ] as const) {
    await page.evaluate(async () => {
      const { roomStore, RoomStage } = await import("/src/stores/index.ts");
      roomStore.stage = RoomStage.HAND_SELECTING;
    });
    await page.getByTestId(`waitroom-mora-${choice}`).click();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const packets: number[][] = (window as any).__waitroomPackets;
          return packets.findLast((packet) => packet[2] === 3)?.[3];
        }),
      )
      .toBe(byte);
  }

  await page.evaluate(async () => {
    const { roomStore, RoomStage } = await import("/src/stores/index.ts");
    roomStore.getMePlayer()!.moraResult = 1;
    roomStore.getOpPlayer()!.moraResult = 2;
    roomStore.stage = RoomStage.HAND_SELECTING;
  });
  await expect(
    page.getByTestId("waitroom-player-me").locator("use"),
  ).toHaveAttribute("xlink:href", "#icon-hand-scissors");
  await expect(
    page.getByTestId("waitroom-player-op").locator("use"),
  ).toHaveAttribute("xlink:href", "#icon-hand-rock");

  await page.evaluate(async () => {
    const { roomStore, RoomStage } = await import("/src/stores/index.ts");
    roomStore.stage = RoomStage.TP_SELECTING;
  });
  await page.getByTestId("waitroom-tp-first").click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const packets: number[][] = (window as any).__waitroomPackets;
        return packets.some((packet) => packet[2] === 4);
      }),
    )
    .toBe(true);
});

test("single player can choose a deck before the bot starts the duel", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(async () => {
    const { initStore } = await import("/src/stores/index.ts");
    return initStore.decks;
  });

  await page.evaluate(async () => {
    const { initUIContainer } = await import("/src/container/compat.ts");
    const { deckStore, roomStore } = await import("/src/stores/index.ts");
    const packets: number[][] = [];
    (window as any).__waitroomPackets = packets;
    initUIContainer({
      ws: { send: (packet: Uint8Array) => packets.push([...packet]) },
    } as any);
    deckStore.decks = [
      { deckName: "First", main: [12345], extra: [], side: [] },
      { deckName: "Chosen", main: [67890], extra: [], side: [] },
    ];
    roomStore.singlePlayer = true;
    roomStore.players = [{ name: "Me", isMe: true, state: 3 }];
    roomStore.isHost = true;
    history.pushState({}, "", "/waitroom");
    dispatchEvent(new PopStateEvent("popstate"));
  });

  const select = page.getByTestId("waitroom-deck-select");
  await expect(select).not.toHaveClass(/ant-select-disabled/);
  await select.click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option", {
      hasText: "Chosen",
    })
    .click();
  await expect(select).toContainText("Chosen");

  await page.getByTestId("waitroom-ready-toggle").click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const packets: number[][] = (window as any).__waitroomPackets;
        const deckPacket = packets.findLast((packet) => packet[2] === 2);
        return [
          deckPacket
            ? new DataView(new Uint8Array(deckPacket).buffer).getUint32(
                11,
                true,
              )
            : 0,
          packets.some((packet) => packet[2] === 34),
          packets.some((packet) => packet[2] === 22),
          packets.some((packet) => packet[2] === 37),
        ];
      }),
    )
    .toEqual([67890, true, true, false]);

  await page.evaluate(async () => {
    const { roomStore } = await import("/src/stores/index.ts");
    roomStore.players[0]!.state = 2;
    roomStore.players[1] = { name: "Bot", isMe: false, state: 2 };
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__waitroomPackets.filter(
            (packet: number[]) => packet[2] === 37,
          ).length,
      ),
    )
    .toBe(1);
});
