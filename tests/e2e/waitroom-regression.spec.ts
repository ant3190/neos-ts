import { expect, test, type WebSocketRoute } from "@playwright/test";

import { installOfflineDuelResources } from "./helpers/offlineDuel";

test.beforeEach(async ({ page }) => {
  await installOfflineDuelResources(page);
});

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
    roomStore.joined = true;
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

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__waitroomPackets.filter(
            (packet: number[]) => packet[2] === 22,
          ).length,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(() =>
      (window as any).__waitroomPackets.some(
        (packet: number[]) => packet[2] === 34 || packet[2] === 37,
      ),
    ),
  ).toBe(false);

  await page.getByTestId("waitroom-ready-toggle").click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const packets: number[][] = (window as any).__waitroomPackets;
        const deckPacket = packets.findLast((packet) => packet[2] === 2);
        const chatPacket = packets.findLast((packet) => packet[2] === 22);
        return [
          deckPacket
            ? new DataView(new Uint8Array(deckPacket).buffer).getUint32(
                11,
                true,
              )
            : 0,
          packets.some((packet) => packet[2] === 34),
          chatPacket
            ? new TextDecoder("utf-16le")
                .decode(new Uint8Array(chatPacket.slice(3)))
                .replace(/\0.*$/, "")
            : "",
          packets.some((packet) => packet[2] === 37),
        ];
      }),
    )
    .toEqual([67890, true, "/ai", false]);

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

test("single mode preserves shuffle and room identity on the wire, then adds AI after host confirmation", async ({
  page,
}) => {
  await page.route(/test-release-v2\.json/, (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  const sessions: { socket: WebSocketRoute; packets: Buffer[] }[] = [];
  const frame = (type: number, data = Buffer.alloc(0)) => {
    const packet = Buffer.alloc(3 + data.length);
    packet.writeUInt16LE(1 + data.length);
    packet[2] = type;
    data.copy(packet, 3);
    return packet;
  };
  const enter = (name: string, position: number) => {
    const data = Buffer.alloc(41);
    data.write(name, 0, 38, "utf16le");
    data[40] = position;
    return frame(32, data);
  };
  await page.routeWebSocket(
    /wss:\/\/koishi\.momobako\.com:7211\/?$/,
    (socket) => {
      const session = { socket, packets: [] as Buffer[] };
      sessions.push(session);
      socket.onMessage((message) => {
        if (typeof message === "string") return;
        session.packets.push(message);
        if (message[2] === 18) socket.send(frame(18));
        if (message[2] === 22) {
          expect(
            message.subarray(3).toString("utf16le").replace(/\0.*$/, ""),
          ).toBe("/ai");
          socket.send(enter("Bot", 1));
          socket.send(frame(33, Buffer.from([0x19])));
        }
        if (message[2] === 34) socket.send(frame(33, Buffer.from([0x09])));
      });
    },
  );
  const passwords: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto("/match");
    await page.waitForFunction(async () => {
      const { initStore } = await import("/src/stores/index.ts");
      return initStore.decks;
    });
    await page.evaluate(async () => {
      const { deckStore } = await import("/src/stores/index.ts");
      deckStore.decks = [
        { deckName: "Test", main: [46986414], extra: [], side: [] },
      ];
    });
    await page.getByText(/^(单人模式|Single Player Mode)$/).click();
    await expect(page).toHaveURL(/\/waitroom$/);
    const session = sessions[attempt];
    const join = session.packets.find((packet) => packet[2] === 18)!;
    const passwordBytes = join.subarray(11, 51);
    const password = passwordBytes.toString("utf16le").replace(/\0.*$/, "");
    expect(password.length).toBeLessThan(20);
    expect(
      passwordBytes.subarray(password.length * 2, password.length * 2 + 2),
    ).toEqual(Buffer.from([0, 0]));
    const [rules, roomId] = password.split("#");
    expect(rules.split(",")).not.toContain("NS");
    expect(rules.split(",")).not.toContain("NOSHUFFLE");
    expect(roomId.length).toBeGreaterThanOrEqual(8);
    passwords.push(password);
    await expect(page.getByTestId("waitroom-deck-select")).toBeVisible();
    expect(session.packets.some((packet) => packet[2] === 22)).toBe(false);

    session.socket.send(enter("Me", 0));
    session.socket.send(frame(19, Buffer.from([0x10])));
    await expect(page.getByTestId("waitroom-player-op")).toHaveAttribute(
      "data-player-name",
      "Bot",
    );
    await expect(page.getByTestId("waitroom-deck-select")).not.toHaveClass(
      /ant-select-disabled/,
    );
    expect(session.packets.filter((packet) => packet[2] === 22)).toHaveLength(
      1,
    );
    expect(session.packets.some((packet) => packet[2] === 37)).toBe(false);
    await page.getByTestId("waitroom-ready-toggle").click();
    await expect
      .poll(() => session.packets.filter((packet) => packet[2] === 37).length)
      .toBe(1);
    expect(session.packets.filter((packet) => packet[2] === 22)).toHaveLength(
      1,
    );
    session.socket.close();
  }
  expect(passwords[0]).not.toBe(passwords[1]);
});
