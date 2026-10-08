import { type Interactivity, InteractType } from "@/stores/matStore/types";

export type ActionHighlight = "gold" | "blue";

/** Match MDPro3: activation/special summon takes priority over ordinary actions. */
export const getActionHighlight = (
  actions: readonly Pick<Interactivity<unknown>, "interactType">[],
): ActionHighlight | undefined => {
  let ordinaryAction = false;
  for (const { interactType } of actions) {
    switch (interactType) {
      case InteractType.ACTIVATE:
      case InteractType.SP_SUMMON:
        return "gold";
      case InteractType.SUMMON:
      case InteractType.ATTACK:
      case InteractType.MSET:
      case InteractType.SSET:
      case InteractType.POS_CHANGE:
        ordinaryAction = true;
    }
  }
  return ordinaryAction ? "blue" : undefined;
};
