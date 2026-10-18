import { ygopro } from "@/api";
import { InteractType } from "@/stores";

export const mdpro3Asset = (name: string) =>
  `${import.meta.env.BASE_URL}neos-assets/mdpro3/${name}.png`;

/** Use the source sprites without replacing Neos' button geometry. */
export function actionSprite(
  action: InteractType,
  position?: ygopro.CardPosition,
) {
  const icons: Partial<Record<InteractType, string>> = {
    [InteractType.ATTACK]: "01",
    [InteractType.SP_SUMMON]: "03",
    [InteractType.ACTIVATE]: "04",
    [InteractType.SUMMON]: "05",
    [InteractType.SSET]: "07",
    [InteractType.MSET]: "11",
  };
  const number =
    action === InteractType.POS_CHANGE
      ? [
          ygopro.CardPosition.FACEUP_DEFENSE,
          ygopro.CardPosition.FACEDOWN_DEFENSE,
        ].includes(position!)
        ? "08"
        : "09"
      : icons[action];
  return number ? mdpro3Asset(`GUI_T_DuelButtonActIcon${number}_1`) : undefined;
}
