import { ygopro } from "@/api";

import { cardPose } from "../../../layout/cardPose";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

export const moveToHand: MoveFunc = async ({ card, api, options }) => {
  await asyncStart(api)({
    ...cardPose(card),
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
