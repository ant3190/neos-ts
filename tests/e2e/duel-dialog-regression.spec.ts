import { expect, test } from "@playwright/test";
import { installOfflineDuelResources } from "./helpers/offlineDuel";

test("old duel prompts close and effect choices send the correct response", async ({
  page,
}) => {
  await installOfflineDuelResources(page);
  await page.goto("/");
  await page.waitForFunction(async () => {
    const { initStore } = await import("/src/stores/index.ts");
    return initStore.sqlite.progress === 1 && initStore.i18n;
  });

  await page.evaluate(async () => {
    const { initUIContainer } = await import("/src/container/compat.ts");
    const packets: number[][] = [];
    (window as any).__dialogPackets = packets;
    initUIContainer({
      ws: { send: (packet: Uint8Array) => packets.push([...packet]) },
    } as any);
    history.pushState({}, "", "/duel");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByTestId("duel-option-modal")).not.toBeVisible();

  await page.evaluate(async () => {
    const { displayOptionModal } = await import(
      "/src/ui/Duel/Message/OptionModal/index.tsx"
    );
    void displayOptionModal(
      "Previous duel",
      [{ info: "Old effect", response: 9 }],
      1,
    );
  });
  await expect(page.getByTestId("duel-option-modal")).toBeVisible();

  await page.evaluate(async () => {
    const { resetDuelDialogs } = await import("/src/ui/Duel/Message/reset.ts");
    resetDuelDialogs();
  });
  await expect(page.getByTestId("duel-option-modal")).not.toBeVisible();

  await page.evaluate(async () => {
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { sendSelectIdleCmdResponse } = await import(
      "/src/api/ocgcore/ocgHelper.ts"
    );
    const { displayOptionModal } = await import(
      "/src/ui/Duel/Message/OptionModal/index.tsx"
    );
    const packets: number[][] = (window as any).__dialogPackets;
    sendSelectIdleCmdResponse(getUIContainer().conn, 42);
    (window as any).__expectedIdlePacket = packets.pop();
    void displayOptionModal(
      "Current duel",
      [{ info: "Activate", response: 42 }],
      1,
      "idle",
    );
  });
  await page.getByTestId("duel-option-item").dblclick();
  await expect
    .poll(() => page.evaluate(() => (window as any).__dialogPackets.at(-1)))
    .toEqual(await page.evaluate(() => (window as any).__expectedIdlePacket));
});
