import { type Interactivity, InteractType } from "@/stores/matStore/types";

/** MDPro3 DuelButtonType ordering. Special summon (including pendulum) is gold. */
export const ACTION_ORDER = [
  InteractType.ACTIVATE,
  InteractType.ATTACK,
  InteractType.POS_CHANGE,
  InteractType.SP_SUMMON,
  InteractType.SUMMON,
  InteractType.SSET,
  InteractType.MSET,
];

export function sameInteraction(
  a: Interactivity<number>,
  b: Interactivity<number>,
) {
  return (
    a.interactType === b.interactType &&
    a.response === b.response &&
    a.activateIndex === b.activateIndex &&
    a.responseSource === b.responseSource
  );
}
export function interactionAvailable(
  actions: readonly Interactivity<number>[],
  chosen: Interactivity<number>,
) {
  return actions.some((current) => sameInteraction(current, chosen));
}
