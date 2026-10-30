import { ygopro } from "@/api";
import MsgSelectCard = ygopro.StocGameMessage.MsgSelectCard;

import { Container } from "@/container";
import { displaySelectActionsModal } from "@/ui/Duel/Message/SelectActionsModal";

import { fetchCheckCardMeta } from "../utils";
import { canSelectOnField } from "./util";

export default async (container: Container, selectCard: MsgSelectCard) => {
  const { cancelable, min, max, cards } = selectCard;
  const context = container.context;

  // TODO: handle release_param

  const { selecteds, mustSelects, selectables } = await fetchCheckCardMeta(
    context,
    cards,
  );
  await displaySelectActionsModal({
    fieldSelection: canSelectOnField(
      context,
      cards.map((card) => card.location),
    ),
    cancelable,
    min,
    max,
    selecteds,
    mustSelects,
    selectables,
  });
};
