import { ygopro } from "@/api";
import { type CardType, matStore } from "@/stores";

import { animationQuality } from "../../../animation/runtime";
import type { SpringApi } from "./types";
import { asyncStart } from "./utils";

/** 发动效果的动画 */
export const focus = async (props: { card: CardType; api: SpringApi }) => {
  const { card, api } = props;
  const quality = animationQuality();
  if (quality === "off") return;
  const current = { ...api.current[0].get() };
  const duration = quality === "full" ? 200 : 100;
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
    await new Promise((resolve) =>
      setTimeout(resolve, quality === "full" ? 700 : 180),
    );
    await asyncStart(api)({ ...current, config: { duration } });
  } else {
    await asyncStart(api)({
      z: current.z + 60,
      scale: current.scale * 1.07,
      config: { duration },
    });
    await new Promise((resolve) =>
      setTimeout(resolve, quality === "full" ? 700 : 180),
    );
    await asyncStart(api)({ ...current, config: { duration } });
  }
};
