import { expect, type Page, test, type WebSocketRoute } from "@playwright/test";

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

async function seedSingleRoom(page: Page) {
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
      { deckName: "First", main: [46986414], extra: [], side: [] },
      { deckName: "Chosen", main: [100000001], extra: [], side: [] },
    ];
    roomStore.singlePlayer = true;
    roomStore.joined = true;
    roomStore.players = [{ name: "Me", isMe: true, state: 3 }];
    roomStore.isHost = true;
    history.pushState({}, "", "/waitroom");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByTestId("waitroom-start")).toBeVisible();
}

async function chooseDeck(page: Page, name: string) {
  await page.getByTestId("waitroom-deck-select").click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option", {
      hasText: name,
    })
    .click();
  await expect(page.getByTestId("waitroom-deck-select")).toContainText(name);
}

async function packetTypes(page: Page) {
  return page.evaluate(() =>
    (window as any).__waitroomPackets.map((packet: number[]) => packet[2]),
  );
}

test("single player uploads the chosen deck and adds AI only after explicit Start and ready confirmation", async ({
  page,
}) => {
  await seedSingleRoom(page);
  await expect(page.getByTestId("waitroom-deck-select")).not.toHaveClass(
    /ant-select-disabled/,
  );
  await chooseDeck(page, "Chosen");
  // Entering the lobby or selecting a deck must not upload it, summon AI, or ready/start.
  expect(await packetTypes(page)).toEqual([]);
  await expect(page.getByTestId("waitroom-start")).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await expect(page.getByTestId("waitroom-ready-toggle")).toHaveCount(0);

  await page.getByTestId("waitroom-start").click();
  await expect.poll(() => packetTypes(page)).toEqual([2, 34]);
  const submitted = await page.evaluate(() => {
    const packet: number[] = (window as any).__waitroomPackets[0];
    return new DataView(new Uint8Array(packet).buffer).getUint32(11, true);
  });
  expect(submitted).toBe(100000001);
  await expect(page.getByTestId("waitroom-start")).toHaveAttribute(
    "aria-busy",
    "true",
  );

  await page.evaluate(async () => {
    const { roomStore } = await import("/src/stores/index.ts");
    roomStore.getMePlayer()!.state = 2;
  });
  await expect.poll(() => packetTypes(page)).toEqual([2, 34, 22]);
  expect(
    await page.evaluate(() => {
      const packets: number[][] = (window as any).__waitroomPackets;
      return new TextDecoder("utf-16le")
        .decode(new Uint8Array(packets[2].slice(3)))
        .replace(/\0.*$/, "");
    }),
  ).toBe("/ai");
  await page.evaluate(async () => {
    const { roomStore } = await import("/src/stores/index.ts");
    roomStore.players[1] = { name: "Bot", isMe: false, state: 2 };
  });
  await expect.poll(() => packetTypes(page)).toEqual([2, 34, 22, 37]);
  // A repeated ready notification cannot submit a second start.
  await page.evaluate(async () => {
    const { roomStore } = await import("/src/stores/index.ts");
    roomStore.players[1]!.name = "Bot ready";
  });
  expect(await packetTypes(page)).toEqual([2, 34, 22, 37]);
});

test("changing decks cancels a pending AI start and late bot readiness cannot lock the selection", async ({
  page,
}) => {
  await seedSingleRoom(page);
  await page.getByTestId("waitroom-start").click();
  await page.evaluate(async () => {
    const { roomStore } = await import("/src/stores/index.ts");
    roomStore.getMePlayer()!.state = 2;
  });
  await expect.poll(() => packetTypes(page)).toEqual([2, 34, 22]);
  await chooseDeck(page, "Chosen");
  await expect.poll(() => packetTypes(page)).toEqual([2, 34, 22, 35]);
  await expect(page.getByTestId("waitroom-start")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.evaluate(async () => {
    const { roomStore } = await import("/src/stores/index.ts");
    roomStore.players[1] = { name: "Late Bot", isMe: false, state: 2 };
    roomStore.getMePlayer()!.state = 2;
  });
  await expect(page.getByTestId("waitroom-player-op")).toHaveAttribute(
    "data-player-name",
    "Late Bot",
  );
  expect(await packetTypes(page)).toEqual([2, 34, 22, 35]);
  await expect(page.getByTestId("waitroom-deck-select")).not.toHaveClass(
    /ant-select-disabled/,
  );

  await page.getByTestId("waitroom-start").click();
  await expect
    .poll(() => packetTypes(page))
    .toEqual([2, 34, 22, 35, 35, 2, 34]);
  await page.evaluate(async () => {
    const { roomStore } = await import("/src/stores/index.ts");
    roomStore.getMePlayer()!.state = 2;
  });
  await expect
    .poll(() => packetTypes(page))
    .toEqual([2, 34, 22, 35, 35, 2, 34, 37]);
  expect(
    await page.evaluate(() => {
      const packets: number[][] = (window as any).__waitroomPackets;
      const packet = packets.findLast((p) => p[2] === 2)!;
      return new DataView(new Uint8Array(packet).buffer).getUint32(11, true);
    }),
  ).toBe(100000001);
});

test("start errors unlock the lobby and allow selecting another deck", async ({
  page,
}) => {
  await seedSingleRoom(page);
  await page.getByTestId("waitroom-start").click();
  await page.evaluate(async () => {
    const { roomStore } = await import("/src/stores/index.ts");
    roomStore.errorMsg = "服务器无法识别此卡";
  });
  await expect(page.getByTestId("waitroom-start")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect.poll(() => packetTypes(page)).toEqual([2, 34, 35]);
  await chooseDeck(page, "Chosen");
  await page.getByTestId("waitroom-start").click();
  await expect.poll(() => packetTypes(page)).toEqual([2, 34, 35, 2, 34]);
});

test("an unavailable AI times out without locking the deck or preventing a retry", async ({
  page,
}) => {
  await page.clock.install();
  await seedSingleRoom(page);
  await page.getByTestId("waitroom-start").click();
  await page.evaluate(async () => {
    const { roomStore } = await import("/src/stores/index.ts");
    roomStore.getMePlayer()!.state = 2;
  });
  await expect.poll(() => packetTypes(page)).toEqual([2, 34, 22]);
  await page.clock.fastForward(30001);
  await expect(page.getByTestId("waitroom-start")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect.poll(() => packetTypes(page)).toEqual([2, 34, 22, 35]);
  await chooseDeck(page, "Chosen");
  await page.getByTestId("waitroom-start").click();
  await page.evaluate(async () => {
    const { roomStore } = await import("/src/stores/index.ts");
    roomStore.getMePlayer()!.state = 2;
  });
  await expect
    .poll(() => packetTypes(page))
    .toEqual([2, 34, 22, 35, 2, 34, 22]);
  await page.getByTestId("waitroom-ready-toggle").click();
  await expect(page.getByTestId("waitroom-start")).toHaveAttribute(
    "aria-busy",
    "false",
  );
});

test("single-player Start stays disabled until a deck and host identity are available", async ({
  page,
}) => {
  await seedSingleRoom(page);
  for (const missing of ["deck", "host", "joined", "player"]) {
    await page.evaluate(async (missing) => {
      const { deckStore, roomStore } = await import("/src/stores/index.ts");
      deckStore.decks =
        missing === "deck"
          ? []
          : [{ deckName: "Test", main: [46986414], extra: [], side: [] }];
      roomStore.isHost = missing !== "host";
      roomStore.joined = missing !== "joined";
      roomStore.players =
        missing === "player" ? [] : [{ name: "Me", isMe: true, state: 3 }];
    }, missing);
    const start = page.getByTestId("waitroom-start");
    await expect(start).toHaveAttribute("aria-disabled", "true");
    // Dispatch directly to check the handler, since the shared button is a span.
    await start.dispatchEvent("click");
    await start.dispatchEvent("keydown", { key: "Enter" });
    expect(await packetTypes(page)).toEqual([]);
  }
});

test("single mode creates a shuffled no-banlist room, waits for Start, and reaches guessing with the selected deck", async ({
  page,
}) => {
  await page.route(/test-release-v2\.json/, (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  const sessions: {
    socket: WebSocketRoute;
    packets: Buffer[];
    rules: string;
    deckCode: number;
  }[] = [];
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
      const session = {
        socket,
        packets: [] as Buffer[],
        rules: "",
        deckCode: 0,
      };
      sessions.push(session);
      socket.onMessage((message) => {
        if (typeof message === "string") return;
        session.packets.push(message);
        if (message[2] === 18) {
          session.rules = message
            .subarray(11, 51)
            .toString("utf16le")
            .replace(/\0.*$/, "")
            .split("#")[0];
          socket.send(frame(18));
        }
        if (message[2] === 2) session.deckCode = message.readUInt32LE(11);
        if (message[2] === 22) {
          expect(
            message.subarray(3).toString("utf16le").replace(/\0.*$/, ""),
          ).toBe("/ai");
          socket.send(enter("Bot", 1));
          socket.send(frame(33, Buffer.from([0x19])));
        }
        if (message[2] === 34) {
          // Apply SRVPro's two independent rules: this fixture deck is banned and
          // exceeds the default three-copy limit. Both rules must reach the server.
          if (
            /(^|,)(NOLFLIST|NF)(,|$)/.test(session.rules) &&
            /(^|,)(NOCHECK|NC)(,|$)/.test(session.rules)
          ) {
            socket.send(frame(33, Buffer.from([0x09])));
          } else {
            const error = Buffer.alloc(8);
            error[0] = 2;
            error.writeUInt32LE(0x10000000 | session.deckCode, 4);
            socket.send(frame(2, error));
          }
        }
        if (message[2] === 37) {
          socket.send(frame(21));
          socket.send(frame(3));
        }
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
      const { forbidden } = await import("/src/api/forbiddens.ts");
      forbidden.set(100000001, 0);
      deckStore.decks = [
        {
          deckName: "First",
          main: Array(40).fill(46986414),
          extra: [],
          side: [],
        },
        {
          deckName: "Chosen",
          main: Array(40).fill(100000001),
          extra: [],
          side: [],
        },
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
    expect(rules.split(",")).toEqual(["NF", "NC", "TI0"]);
    expect(roomId.length).toBe(9);
    passwords.push(password);
    await expect(page.getByTestId("waitroom-start")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.getByTestId("waitroom-start").dispatchEvent("click");
    expect(session.packets.map((packet) => packet[2])).toEqual([16, 18]);

    session.socket.send(enter("Me", 0));
    session.socket.send(frame(19, Buffer.from([0x10])));
    await expect(page.getByTestId("waitroom-player-me")).toHaveAttribute(
      "data-player-name",
      "Me",
    );
    await chooseDeck(page, "Chosen");
    expect(session.packets.map((packet) => packet[2])).toEqual([16, 18]);
    await expect(page.getByTestId("waitroom-start")).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    // Exercise keyboard activation as well as the real WebSocket event loop.
    await page.getByTestId("waitroom-start").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("waitroom-mora-scissors")).toBeVisible();
    expect(session.packets.map((packet) => packet[2])).toEqual([
      16, 18, 2, 34, 22, 37,
    ]);
    expect(session.deckCode).toBe(100000001);
    await expect(page.getByTestId("waitroom-deck-select")).toHaveClass(
      /ant-select-disabled/,
    );
    session.socket.close();
  }
  expect(passwords[0]).not.toBe(passwords[1]);
});
