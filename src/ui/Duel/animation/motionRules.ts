import { ygopro } from "@/api/ocgcore/idl/ocgcore";
const { DECK, HAND, MZONE, SZONE, EXTRA, GRAVE, REMOVED } = ygopro.CardZone;

export type CardMotionKind =
  | "move"
  | "draw"
  | "reflow"
  | "position"
  | "summon"
  | "set"
  | "grave"
  | "banish"
  | "return"
  | "destroy"
  | "release"
  | "material"
  | "exit";

/** Event/reason distinctions from MDPro3 GameCard.MoveAsync, without its assets. */
export function cardMotionPlan({
  fromZone,
  toZone,
  toPosition,
  positionOnly,
  reason = 0,
  mine = true,
  exit = false,
}: {
  fromZone?: number;
  toZone: number;
  toPosition?: number;
  positionOnly?: boolean;
  reason?: number;
  mine?: boolean;
  exit?: boolean;
}) {
  let kind: CardMotionKind = "move";
  let duration = 400;
  let arc = 200;
  if (exit)
    return {
      kind: "exit" as CardMotionKind,
      duration: 180,
      arc: 0,
      depart: false,
    };
  if (positionOnly)
    return {
      kind: "position" as CardMotionKind,
      duration: 200,
      arc: 100,
      depart: false,
    };
  // A hand layout refresh only slides existing cards along their row.
  if (toZone === HAND && (fromZone === HAND || fromZone === undefined))
    return {
      kind: "reflow" as CardMotionKind,
      duration: 180,
      arc: 0,
      depart: false,
    };
  if (toZone === HAND) {
    kind = fromZone === DECK ? "draw" : "return";
    duration = mine ? 500 : fromZone === DECK ? 250 : 400;
    arc = fromZone === DECK ? 50 : 200;
  } else if (toZone === DECK || toZone === EXTRA) {
    kind = "return";
    arc = 300;
  } else if (toZone === GRAVE) kind = "grave";
  else if (toZone === REMOVED) kind = "banish";
  else if (
    (toZone === MZONE || toZone === SZONE) &&
    fromZone !== MZONE &&
    fromZone !== SZONE
  ) {
    kind = [
      ygopro.CardPosition.FACEDOWN,
      ygopro.CardPosition.FACEDOWN_ATTACK,
      ygopro.CardPosition.FACEDOWN_DEFENSE,
    ].includes(toPosition ?? -1)
      ? "set"
      : "summon";
    arc = 400;
  }
  if (reason & 1) kind = "destroy";
  else if (reason & 8) kind = "material";
  else if (reason & 2) kind = "release";
  const depart =
    ["destroy", "material", "release"].includes(kind) &&
    (fromZone === HAND || fromZone === MZONE || fromZone === SZONE);
  return { kind, duration, arc, depart };
}
