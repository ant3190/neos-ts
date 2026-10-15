import { sendTimeConfirm, ygopro } from "@/api";
import { Container } from "@/container";

export default function handleTimeLimit(
  container: Container,
  timeLimit: ygopro.StocTimeLimit,
) {
  const context = container.context;
  context.matStore.timeLimits.set(timeLimit.player, timeLimit.left_time);
  context.matStore.timerPlayer = timeLimit.player;
  if (context.matStore.isMe(timeLimit.player)) {
    sendTimeConfirm(container.conn);
  }
}
