import { ygopro } from "@/api";
import { cardStore, type CardType, isMe } from "@/stores";

import { handInteraction } from "../interaction/hand";
import { tablePose } from "./geometry";

export function cardPose(card: CardType) {
  const mine = isMe(card.location.controller);
  const hand = card.location.zone === ygopro.CardZone.HAND;
  const pose = tablePose(
    card.location,
    mine,
    hand
      ? cardStore.at(ygopro.CardZone.HAND, card.location.controller).length
      : 0,
    card.code !== 0,
  );
  if (hand && mine) pose.x += handInteraction.offset;
  return pose;
}
