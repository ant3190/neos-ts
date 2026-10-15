import { sendSelectMultiResponse, ygopro } from "@/api";
import MsgSelectCard = ygopro.StocGameMessage.MsgSelectCard;

import { Container } from "@/container";
import { displaySelectActionsModal } from "@/ui/Duel/Message/SelectActionsModal";

import { fetchCheckCardMeta } from "../utils";
import { canSelectOnField } from "./util";

export default async (container: Container, selectCard: MsgSelectCard) => {
  const { cancelable, min, max, cards } = selectCard;
  const conn = container.conn;
  const context = container.context;

  // TODO: handle release_param

  if (!cancelable && cards.length === 1 && min === 1) {
    // auto send
    sendSelectMultiResponse(conn, [cards[0].response]);
    return;
  }

  const { selecteds, mustSelects, selectables } = await fetchCheckCardMeta(
    context,
    cards,
  );
  await displaySelectActionsModal({
    fieldSelection: canSelectOnField(
      context,
      cards.map((card) => card.location),
    ),
    autoSubmit: "max",
    cancelable,
    min,
    max,
    selecteds,
    mustSelects,
    selectables,
  });
};
