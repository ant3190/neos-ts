import { ygopro } from "@/api";
import { type CardType, matStore } from "@/stores";

import { MDPRO3 } from "../../../animation/mdpro3";
import { animationQuality, waitForAnimation } from "../../../animation/runtime";
import { getDuelEpoch } from "../../../Message/session";
import type { SpringApi } from "./types";
import { asyncStart, getDuration } from "./utils";

/** 发动效果的动画 */
export const focus = async (props: {
  card: CardType;
  api: SpringApi;
  kind?: "activate" | "confirm";
}) => {
  const { card, api } = props;
  const quality = animationQuality();
  if (quality === "off") return;
  const current = { ...api.current[0].get() };
  const timing = props.kind === "confirm" ? MDPRO3.confirm : MDPRO3.activate;
  const duration = quality === "full" ? getDuration(timing.enter) : 100;
  const exit = quality === "full" ? getDuration(timing.exit) : 100;
  const epoch = getDuelEpoch();
  if (
    card.location.zone === ygopro.CardZone.HAND ||
    card.location.zone === ygopro.CardZone.DECK ||
    card.location.zone === ygopro.CardZone.EXTRA
  ) {
    await asyncStart(api)({
      y: current.y + (matStore.isMe(card.location.controller) ? -1 : 1) * 120,
      ry: 0,
      rz: matStore.isMe(card.location.controller) ? 0 : 180,
      z: current.z + 50,
      scale: current.scale * 1.08,
      config: { duration },
    });
    // Hold the revealed hand card briefly before returning it to the hand.
    await waitForAnimation(quality === "full" ? getDuration(timing.hold) : 180);
    if (epoch !== getDuelEpoch()) return;
    await asyncStart(api)({ ...current, config: { duration: exit } });
  } else {
    await asyncStart(api)({
      y: current.y - (quality === "full" ? 35 : 12),
      z: current.z + 60,
      scale: current.scale * 1.12,
      ry: 0,
      config: { duration },
    });
    await waitForAnimation(quality === "full" ? getDuration(timing.hold) : 180);
    if (epoch !== getDuelEpoch()) return;
    await asyncStart(api)({ ...current, config: { duration: exit } });
  }
};
