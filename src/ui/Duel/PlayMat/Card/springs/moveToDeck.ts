import { isMe } from "@/stores";

import { tablePose } from "../../../layout/geometry";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

export const moveToDeck: MoveFunc = async ({ card, api, options }) => {
  await asyncStart(api)({
    ...tablePose(
      card.location,
      isMe(card.location.controller),
      0,
      card.code !== 0,
    ),
    subZ: options?.instant ? 0 : 100,
    opacity: 1,
    config: {
      duration: options?.instant ? 0 : options?.durationMs ?? getDuration(),
    },
  });
};
