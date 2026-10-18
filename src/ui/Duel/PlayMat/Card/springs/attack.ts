import { easings } from "@react-spring/web";

import { isMe } from "@/stores";

import { battleTiming } from "../../../animation/mdpro3";
import { animationQuality, waitForAnimation } from "../../../animation/runtime";
import { tablePose } from "../../../layout/geometry";
import { getDuelEpoch } from "../../../Message/session";
import type { AttackFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

export const attack: AttackFunc = async (props) => {
  const { card, api, options } = props;
  if (animationQuality() === "off") return;
  const current = { ...api.current[0].get() };
  const epoch = getDuelEpoch();
  const timing = battleTiming(card.meta.data.atk ?? 0);

  let x = current.x;
  let y = current.y;
  let rz = current.rz;
  if (options?.directAttack) {
    // 直接攻击
    y = 360;

    if (isMe(card.location.controller)) {
      y = -y;
    }
  } else if (options?.target) {
    // 攻击`target`
    const target = tablePose(options.target, isMe(options.target.controller));
    x = target.x;
    y = target.y;
    rz += -Math.atan2(x - current.x, Math.abs(y - current.y)) / (Math.PI / 180);
  } else {
    console.error(`<Spring/Attack>directAttack is false and target is null.`);
    return;
  }

  const dx = x - current.x,
    dy = y - current.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  // MDPro3: wind-up, strike, hit pause, then restore the complete source pose.
  await asyncStart(api)({
    x: current.x - (dx / distance) * 65,
    y: current.y - (dy / distance) * 65,
    z: current.z + 50,
    rz,
    config: { duration: getDuration(timing.windup) },
  });
  if (epoch !== getDuelEpoch()) return;
  // 加速前冲
  await asyncStart(api)({
    x,
    y,
    config: {
      easing: easings.easeInOutSine,
      duration: getDuration(timing.strike),
    },
  });
  if (epoch !== getDuelEpoch()) return;
  options.onHit?.();
  await waitForAnimation(getDuration(timing.hit));
  if (epoch !== getDuelEpoch()) return;
  // 减速归位
  await asyncStart(api)({
    ...current,
    config: {
      easing: easings.easeInOutQuad,
      duration: getDuration(timing.return),
    },
  });
};
