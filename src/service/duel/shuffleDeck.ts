import { ygopro } from "@/api";
import { Container } from "@/container";

export default (
  container: Container,
  shuffleDeck: ygopro.StocGameMessage.MsgShuffleDeck,
) => {
  const context = container.context;
  const player = shuffleDeck.player;
  for (const card of context.cardStore.at(ygopro.CardZone.DECK, player)) {
    // 把数据抹掉就好了
    card.code = 0;
    card.meta = { id: 0, data: {}, text: {} };
  }
};
