import { fetchCard, getStrings, ygopro } from "@/api";
import { DESCRIPTION_LIMIT } from "@/api/strings";
import { displayYesNoModal } from "@/ui/Duel/Message";

type MsgSelectYesNo = ygopro.StocGameMessage.MsgSelectYesNo;

export default async (selectYesNo: MsgSelectYesNo) => {
  const _player = selectYesNo.player;
  const effect_description = selectYesNo.effect_description;

  const msg = getStrings(effect_description, false);
  const meta =
    effect_description >= DESCRIPTION_LIMIT
      ? fetchCard(effect_description >>> 4)
      : undefined;
  await displayYesNoModal(msg, meta);
};
