import { ygopro } from "@/api";
import { cardStore, isMe } from "@/stores";

import { handInteraction } from "../../../interaction/hand";
import { tablePose } from "../../../layout/geometry";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

export const moveToHand: MoveFunc = async ({ card, api, options }) => {
  const mine = isMe(card.location.controller);
  const count = cardStore.at(
    ygopro.CardZone.HAND,
    card.location.controller,
  ).length;
  const pose = tablePose(card.location, mine, count, card.code !== 0);
  await asyncStart(api)({
    ...pose,
    x: pose.x + (mine ? handInteraction.offset : 0),
    subZ:
      options?.instant ||
      options?.fromZone === undefined ||
      options.fromZone === ygopro.CardZone.HAND
        ? 0
        : 100,
    opacity: 1,
    config: {
      duration: options?.instant ? 0 : options?.durationMs ?? getDuration(),
      clamp: true,
    },
  });
};
