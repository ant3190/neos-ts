import { ygopro } from "@/api";
import { Container } from "@/container";
import { requestCardImage } from "@/ui/Shared/YgoCard/imageCache";

import { fetchEsHintMeta } from "./util";

export default (
  container: Container,
  flipSummoning: ygopro.StocGameMessage.MsgFlipSummoning,
) => {
  // playEffect(AudioActionType.SOUND_FILP);

  const context = container.context;
  requestCardImage(flipSummoning.code);
  fetchEsHintMeta({
    context: context,
    originMsg: "「[?]」反转召唤宣言时",
    cardID: flipSummoning.code,
  });

  context.historyStore.putFlipSummon(
    context,
    flipSummoning.code,
    flipSummoning.location,
  );
};
