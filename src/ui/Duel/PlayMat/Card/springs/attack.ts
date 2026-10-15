// 暂时先简单实现攻击动画，后面有时间再慢慢优化
import { easings } from "@react-spring/web";

import { isMe } from "@/stores";

import { tablePose } from "../../../layout/geometry";
import type { AttackFunc } from "./types";
import { asyncStart } from "./utils";

export const attack: AttackFunc = async (props) => {
  const { card, api, options } = props;
  const current = api.current[0].get();

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

  // 先浮空
  await asyncStart(api)({
    z: 80,
    config: { duration: 70 },
  });
  // 后撤半个卡位，并调整倾斜角
  await asyncStart(api)({
    y: current.y + 86 * (isMe(card.location.controller) ? 1 : -1),
    rz,
    config: { duration: 80 },
  });
  // 加速前冲
  await asyncStart(api)({
    x,
    y,
    config: {
      easing: easings.easeInOutSine,
      duration: 130,
    },
  });
  // 减速归位
  await asyncStart(api)({
    x: current.x,
    y: current.y,
    z: current.z,
    rz: current.rz,
    config: {
      easing: easings.easeInOutQuad,
      duration: 180,
    },
  });
};
