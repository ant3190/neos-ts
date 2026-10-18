import { ygopro } from "@/api";
import { cardStore, type CardType, isMe } from "@/stores";
import { orderedHand } from "@/stores/handOrder";

import { handInteraction } from "../interaction/hand";
import { tablePose } from "./geometry";

export function cardPose(card: CardType) {
  const mine = isMe(card.location.controller);
  const hand = card.location.zone === ygopro.CardZone.HAND;
  const hands = hand
    ? orderedHand(cardStore.at(ygopro.CardZone.HAND, card.location.controller))
    : [];
  const pose = tablePose(
    hand
      ? {
          ...card.location.toObject(),
          zone: card.location.zone,
          sequence: Math.max(
            0,
            hands.findIndex((entry) => entry.uuid === card.uuid),
          ),
        }
      : card.location,
    mine,
    hands.length,
    card.code !== 0,
  );
  if (hand && mine) pose.x += handInteraction.offset;
  return pose;
}
