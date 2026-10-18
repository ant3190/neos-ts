import { ygopro } from "@/api";
import { Container } from "@/container";
import { displayCheckCounterModal } from "@/ui/Duel/Message";

import { canSelectOnField } from "./util";
type MsgSelectCounter = ygopro.StocGameMessage.MsgSelectCounter;

export default async (
  container: Container,
  selectCounter: MsgSelectCounter,
) => {
  const context = container.context;
  await displayCheckCounterModal({
    counterType: selectCounter.counter_type,
    min: selectCounter.min,
    fieldSelection: canSelectOnField(
      context,
      selectCounter.options.map((option) => option.location),
    ),
    options: selectCounter.options!.map(({ location, code, counter_count }) => {
      const id = context.cardStore.find(location)?.code;
      const newCode = code ? code : id || 0;

      return {
        code: newCode,
        max: counter_count!,
        location,
      };
    }),
  });
};
