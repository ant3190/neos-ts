import { isMe } from "@/stores";

import { tablePose } from "../../../layout/geometry";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

export const moveToOutside: MoveFunc = async ({ card, api, options }) => {
  await asyncStart(api)({
    ...tablePose(card.location, isMe(card.location.controller)),
    subZ: options?.instant ? 0 : 100,
    opacity: 1,
    config: {
      duration: options?.instant ? 0 : options?.durationMs ?? getDuration(),
      clamp: true,
    },
  });
  api.set({ subZ: 0 });
};
