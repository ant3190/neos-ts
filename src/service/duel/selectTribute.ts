import { ygopro } from "@/api";
import { Container } from "@/container";
import { displaySelectActionsModal } from "@/ui/Duel/Message/SelectActionsModal";

import { fetchCheckCardMeta } from "../utils";
import { canSelectOnField } from "./util";
type MsgSelectTribute = ygopro.StocGameMessage.MsgSelectTribute;

export default async (
  container: Container,
  selectTribute: MsgSelectTribute,
) => {
  const { selecteds, mustSelects, selectables } = await fetchCheckCardMeta(
    container.context,
    selectTribute.selectable_cards.map((card) => ({
      code: card.code,
      location: card.location,
      response: card.response,
      level1: card.level,
    })),
  );
  await displaySelectActionsModal({
    fieldSelection: canSelectOnField(
      container.context,
      selectTribute.selectable_cards.map((c) => c.location),
    ),
    tribute: true,
    cancelable: selectTribute.cancelable,
    overflow: true,
    totalLevels: 0,
    min: selectTribute.min,
    max: selectTribute.max,
    selecteds,
    mustSelects,
    selectables,
  });
};
