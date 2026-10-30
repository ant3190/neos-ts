import { ygopro } from "@/api";
import { Container } from "@/container";
import { isCurrentUIContainer } from "@/container/compat";
import { showMaterialSelection } from "@/ui/Duel/interaction/materialSelection";
import { getDuelEpoch } from "@/ui/Duel/Message/session";

import { fetchCheckCardMeta } from "../utils";
import { canSelectOnField } from "./util";

let revision = 0;

export default async (
  container: Container,
  request: ygopro.StocGameMessage.MsgSelectUnselectCard,
) => {
  if (!isCurrentUIContainer(container)) return;
  const currentRevision = ++revision;
  const epoch = getDuelEpoch();
  const [available, selected] = await Promise.all([
    fetchCheckCardMeta(container.context, request.selectable_cards),
    fetchCheckCardMeta(container.context, request.selected_cards, true),
  ]);
  if (
    currentRevision !== revision ||
    epoch !== getDuelEpoch() ||
    !isCurrentUIContainer(container)
  )
    return;
  showMaterialSelection(container, {
    selectables: available.selectables,
    selecteds: selected.selecteds,
    fieldSelection: canSelectOnField(
      container.context,
      [...request.selectable_cards, ...request.selected_cards].map(
        (info) => info.location,
      ),
    ),
    min: request.min,
    max: request.max,
    finishable: request.finishable,
    cancelable: request.cancelable,
  });
};
