import { easings } from "@react-spring/web";

import { ygopro } from "@/api";
import { isMe } from "@/stores";

import { tablePose } from "../../../layout/geometry";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

export const moveToGround: MoveFunc = async ({ card, api, options }) => {
  const pose = tablePose(card.location, isMe(card.location.controller));
  if (options?.instant) {
    api.set({ ...pose, subZ: 0, opacity: 1 });
    return;
  }
  if (options?.fromZone === ygopro.CardZone.TZONE) {
    api.set({ ...pose, scale: 0, opacity: 0 });
    await asyncStart(api)({
      ...pose,
      opacity: 1,
      config: { duration: options.durationMs ?? getDuration() },
    });
    return;
  }
  // Turning stays in its own slot; an incoming card travels above the table.
  await asyncStart(api)({
    ...pose,
    subZ: 100,
    opacity: 1,
    config: {
      duration: options?.durationMs ?? getDuration(),
      easing: easings.easeOutSine,
      clamp: true,
    },
  });
  await asyncStart(api)({
    z: pose.z,
    subZ: 0,
    config: {
      duration: options?.positionOnly ? 0 : 100,
      easing: easings.easeInQuad,
    },
  });
};
