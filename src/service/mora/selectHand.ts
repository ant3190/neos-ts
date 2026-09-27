import { ygopro } from "@/api";
import { Container } from "@/container";
import { RoomStage } from "@/stores";

export default function handleSelectHand(
  container: Container,
  _: ygopro.YgoStocMsg,
) {
  const context = container.context;
  context.roomStore.stage = RoomStage.HAND_SELECTING;
}
