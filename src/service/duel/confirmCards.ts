import { ygopro } from "@/api";
import { Container } from "@/container";
import { isCurrentUIContainer } from "@/container/compat";
import { AudioActionType, playEffect } from "@/infra/audio";
import { revealDuelCue } from "@/ui/Duel/animation/runtime";
import { getDuelEpoch } from "@/ui/Duel/Message/session";
import { callCardFocus } from "@/ui/Duel/PlayMat/Card";
import { requestCardImage } from "@/ui/Shared/YgoCard/imageCache";

import { waitForDuelPace } from "./pacing";

/** Confirmation is a temporary public face, never a rewrite of a hidden wire code. */
export default async (
  container: Container,
  confirm: ygopro.StocGameMessage.MsgConfirmCards,
) => {
  const context = container.context,
    epoch = getDuelEpoch();
  const deckTop = (confirm as typeof confirm & { is_decktop?: boolean })
    .is_decktop;
  playEffect(AudioActionType.SOUND_REVEAL);
  for (const [index, card] of confirm.cards.entries()) {
    if (!isCurrentUIContainer(container) || epoch !== getDuelEpoch()) return;
    const target = deckTop
      ? context.cardStore
          .at(ygopro.CardZone.DECK, confirm.player)
          .sort((a, b) => b.location.sequence - a.location.sequence)[index]
      : context.cardStore.at(card.location, card.controller, card.sequence);
    requestCardImage(card.code);
    const started = performance.now();
    revealDuelCue({ kind: "reveal", code: card.code, label: "卡片确认" }, 1000);
    if (target) {
      await callCardFocus(target.uuid, { code: card.code, kind: "confirm" });
      if (!isCurrentUIContainer(container) || epoch !== getDuelEpoch()) return;
      context.historyStore.putConfirmed(
        context,
        card.code || target.code,
        target.location,
      );
    }
    if (!isCurrentUIContainer(container) || epoch !== getDuelEpoch()) return;
    await waitForDuelPace(
      { minimumMs: 1000, settleMs: 0 },
      performance.now() - started,
    );
  }
};
