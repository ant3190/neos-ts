import { expect, test } from "@playwright/test";

import effectCards from "./fixtures/effect-text.json";
import { mdpro3Fixture } from "./helpers/mdpro3Fixture";

for (const meta of effectCards) {
  test(`left inspection shows the complete numbered effects of ${meta.text.name}`, async ({
    page,
  }) => {
    await mdpro3Fixture(page);
    await page.evaluate(async (meta) => {
      const { cardStore } = await import("/src/stores/index.ts");
      const card = cardStore.inner.find(
        (entry) => entry.uuid === "p0-MZONE-2",
      )!;
      card.meta = meta;
      const { showCardModal } = await import(
        "/src/ui/Duel/Message/CardModal/index.tsx"
      );
      showCardModal(card);
    }, meta);
    const detail = page.getByTestId("duel-card-detail");
    await expect(detail).toBeVisible();
    const text = (await detail.textContent())!.replace(/[\s：:]/g, "");
    expect(text).toContain(meta.text.desc.replace(/[\s：:]/g, ""));
    const lastLine = meta.text.desc
      .split(/\r?\n/)
      .at(-1)!
      .replace(/^●|^[①-⑩]：/, "")
      .trim();
    const snippet = lastLine
      .split(/\d+/)
      .sort((a, b) => b.length - a.length)[0];
    const lastEffect = detail.getByText(snippet, { exact: false }).last();
    await lastEffect.scrollIntoViewIfNeeded();
    await expect(lastEffect).toBeInViewport();
    await page.screenshot({
      path: test.info().outputPath("monster-effect-text.png"),
    });
  });
}

test("a follow-up yes/no prompt shows the effect inside its body without a card preview", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { default: selectYesNo } = await import(
      "/src/service/duel/selectYesNo.ts"
    );
    const { ygopro } = await import("/src/api/index.ts");
    localStorage.setItem("!system_204", "是否继续发动后续效果？");
    void selectYesNo(
      new ygopro.StocGameMessage.MsgSelectYesNo({
        player: 0,
        effect_description: 204,
      }),
    );
  });
  await expect(page.getByTestId("duel-yesno-modal")).toContainText(
    "是否继续发动后续效果？",
  );
  await page.getByTestId("duel-yesno-no").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__parityPackets.length))
    .toBe(1);
});

test("a card effect yes/no prompt resolves a card description instead of a missing system string", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { default: selectEffectYn } = await import(
      "/src/service/duel/selectEffectYn.ts"
    );
    const { ygopro } = await import("/src/api/index.ts");
    void selectEffectYn(
      new ygopro.StocGameMessage.MsgSelectEffectYn({
        player: 0,
        code: 46986414,
        effect_description: 46986414 * 16,
        location: new ygopro.CardLocation({
          controller: 0,
          zone: ygopro.CardZone.MZONE,
          sequence: 2,
        }),
      }),
    );
  });
  await expect(page.getByTestId("duel-yesno-modal")).toContainText("效果一");
  await expect(page.getByTestId("duel-yesno-effect-text")).toContainText(
    "交互回归测试",
  );
  await expect
    .poll(() =>
      page
        .getByTestId("duel-yesno-modal")
        .evaluate(
          (node) =>
            getComputedStyle(node.closest(".ant-modal-content")!).opacity,
        ),
    )
    .toBe("1");
  await page.screenshot({
    path: test.info().outputPath("effect-confirmation-text.png"),
  });
  await page.getByTestId("duel-yesno-yes").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__parityPackets.length))
    .toBe(1);
});

test("left inspection restores missing static text from the card database", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { showCardModal } = await import(
      "/src/ui/Duel/Message/CardModal/index.tsx"
    );
    const card = cardStore.inner.find((entry) => entry.uuid === "p0-MZONE-2")!;
    card.meta = { ...card.meta, text: { name: card.meta.text.name } };
    showCardModal(card);
  });
  await expect(page.getByTestId("duel-card-detail")).toContainText(
    "交互回归测试",
  );
});

test("empty individual effect strings fall back to the full card rules text", async ({
  page,
}) => {
  await mdpro3Fixture(page);
  await page.evaluate(async () => {
    const { default: selectYesNo } = await import(
      "/src/service/duel/selectYesNo.ts"
    );
    const { ygopro } = await import("/src/api/index.ts");
    void selectYesNo(
      new ygopro.StocGameMessage.MsgSelectYesNo({
        player: 0,
        effect_description: 46986414 * 16 + 2,
      }),
    );
  });
  await expect(page.getByTestId("duel-yesno-message")).toContainText(
    "交互回归测试",
  );
  await expect(page.getByTestId("duel-yesno-modal")).toContainText("测试卡片");
  await page.getByTestId("duel-yesno-no").click();
});
