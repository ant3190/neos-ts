import { easings } from "@react-spring/web";

import { summonTiming } from "../../../animation/mdpro3";
import { animationQuality, waitForAnimation } from "../../../animation/runtime";
import { getDuelEpoch } from "../../../Message/session";
import type { SpringApi } from "./types";
import { asyncStart, getDuration } from "./utils";

/** The flat board keeps its camera; only the summoned card rises and drops. */
export async function land({
  api,
  strong = false,
}: {
  api: SpringApi;
  strong?: boolean;
}) {
  const quality = animationQuality();
  if (quality === "off") return;
  const current = { ...api.current[0].get() };
  const epoch = getDuelEpoch();
  const timing = summonTiming(strong);
  await asyncStart(api)({
    y: current.y - (quality === "full" ? 100 : 20),
    z: current.z + 80,
    config: { duration: getDuration(timing.rise), easing: easings.easeOutQuad },
  });
  if (epoch !== getDuelEpoch()) return;
  if (
    !(await waitForAnimation(
      quality === "full" ? getDuration(timing.hover) : 60,
    ))
  )
    return;
  if (epoch !== getDuelEpoch()) return;
  await asyncStart(api)({
    ...current,
    config: { duration: getDuration(timing.drop), easing: easings.easeInQuad },
  });
}
