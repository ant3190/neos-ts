import { ygopro } from "@/api";
import { Container } from "@/container";
import { RoomStage, SideStage } from "@/stores";

export default function handleSelectTp(
  container: Container,
  _: ygopro.YgoStocMsg,
) {
  const context = container.context;
  if (context.sideStore.stage !== SideStage.NONE) {
    context.sideStore.stage = SideStage.TP_SELECTING;
  } else {
    context.roomStore.stage = RoomStage.TP_SELECTING;
  }
}
