import { ygopro } from "@/api";
import { isMe } from "@/stores";

import { cardMotionPlan } from "../../../animation/motionRules";
import { getDuelEpoch } from "../../../Message/session";
import { moveToDeck } from "./moveToDeck";
import { moveToGround } from "./moveToGround";
import { moveToHand } from "./moveToHand";
import { moveToOutside } from "./moveToOutside";
import { moveToToken } from "./moveToToken";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

const { HAND, GRAVE, REMOVED, DECK, EXTRA, MZONE, SZONE, TZONE } =
  ygopro.CardZone;

export const move: MoveFunc = async (props) => {
  const { card, api } = props;
  const epoch = getDuelEpoch();
  const plan = cardMotionPlan({
    ...props.options,
    toZone: card.location.zone,
    toPosition: card.location.position,
    mine: isMe(card.location.controller),
  });
  if (props.options?.exit) {
    await asyncStart(api)({
      scale: 0,
      opacity: 0,
      config: { duration: getDuration(plan.duration) },
    });
    return;
  }
  if (!props.options?.instant && plan.depart) {
    const current = api.current[0].get();
    await asyncStart(api)({
      scale: current.scale * 0.55,
      opacity: 0.35,
      config: { duration: getDuration(100) },
    });
  }
  if (epoch !== getDuelEpoch()) return;
  api.set({ subZ: 0 });
  props = {
    ...props,
    options: { ...props.options, durationMs: getDuration(plan.duration) },
  };
  switch (card.location.zone) {
    case MZONE:
    case SZONE:
      await moveToGround(props);
      break;
    case HAND:
      await moveToHand(props);
      break;
    case DECK:
    case EXTRA:
      await moveToDeck(props);
      break;
    case GRAVE:
    case REMOVED:
      await moveToOutside(props);
      break;
    case TZONE:
      await moveToToken(props);
      break;
  }
  if (epoch === getDuelEpoch()) api.set({ opacity: 1, subZ: 0 });
};
