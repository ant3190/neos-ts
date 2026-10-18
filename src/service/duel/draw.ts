import { fetchCard, ygopro } from "@/api";
import { Container } from "@/container";
import { AudioActionType, playEffect } from "@/infra/audio";
import { nextHandOrder } from "@/stores/handOrder";
import { rememberCardOrigin } from "@/ui/Duel/animation/origins";
import { callCardMove } from "@/ui/Duel/PlayMat/Card";
import { requestCardImage } from "@/ui/Shared/YgoCard/imageCache";

import { fetchEsHintMeta } from "./util";

export default async (
  container: Container,
  draw: ygopro.StocGameMessage.MsgDraw,
) => {
  const context = container.context;
  fetchEsHintMeta({ context, originMsg: "玩家抽卡时" });

  const drawLength = draw.cards.length;

  // 将卡从卡组移到手牌：设置zone、occupant、sequence
  const hands = context.cardStore.at(ygopro.CardZone.HAND, draw.player);
  const handsLength = hands.length;
  const firstHandOrder = nextHandOrder(hands);
  hands.forEach((card) => {
    card.handOrder ??= card.location.sequence;
  });
  const newHands = context.cardStore
    .at(ygopro.CardZone.DECK, draw.player)
    .sort((a, b) => b.location.sequence - a.location.sequence)
    .slice(0, drawLength);

  // Start image loads without holding the duel message queue on network I/O.
  draw.cards.forEach(requestCardImage);

  for (const idx in newHands) {
    const card = newHands[Number(idx)];
    const code = draw.cards[idx];
    const meta = fetchCard(code);
    rememberCardOrigin(
      card.uuid,
      new ygopro.CardLocation(card.location.toObject()),
    );
    card.code = code;
    card.meta = meta;
    card.location.zone = ygopro.CardZone.HAND;
    card.location.sequence = Number(idx) + handsLength;
    card.handOrder = firstHandOrder + Number(idx);
  }

  playEffect(AudioActionType.SOUND_DRAW);

  // 抽卡动画
  await Promise.all(
    context.cardStore.at(ygopro.CardZone.HAND, draw.player).map((card) =>
      callCardMove(card.uuid, {
        fromZone: newHands.includes(card)
          ? ygopro.CardZone.DECK
          : ygopro.CardZone.HAND,
      }),
    ),
  );
};
