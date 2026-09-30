import { ygopro } from "@/api";
import { type CardType, matStore } from "@/stores";

import type { SpringApi } from "./types";
import { asyncStart, getDuration } from "./utils";

/** 发动效果的动画 */
export const focus = async (props: { card: CardType; api: SpringApi }) => {
  const { card, api } = props;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (
    card.location.zone === ygopro.CardZone.HAND ||
    card.location.zone === ygopro.CardZone.DECK ||
    card.location.zone === ygopro.CardZone.EXTRA
  ) {
    const current = { ...api.current[0].get() };
    const duration = Math.min(getDuration(), 220);
    await asyncStart(api)({
      y: current.y + (matStore.isMe(card.location.controller) ? -1 : 1) * 120,
      ry: 0,
      z: current.z + 50,
      config: { duration },
    });
    // Hold the revealed hand card briefly before returning it to the hand.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await asyncStart(api)({ ...current, config: { duration } });
  } else {
    await asyncStart(api)({
      focusScale: 1.5,
      focusDisplay: "block",
      focusOpacity: 0,
    });
    api.set({ focusScale: 1, focusOpacity: 1, focusDisplay: "none" });
  }
};
