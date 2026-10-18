import { fetchStrings, Region, ygopro } from "@/api";
import MsgToss = ygopro.StocGameMessage.MsgToss;
import { Container } from "@/container";
import { AudioActionType, playEffect } from "@/infra/audio";
import { MDPRO3 } from "@/ui/Duel/animation/mdpro3";
import { emitDuelCue, waitForAnimation } from "@/ui/Duel/animation/runtime";
import { getDuration } from "@/ui/Duel/PlayMat/Card/springs/utils";

export default async (container: Container, toss: MsgToss) => {
  const context = container.context;
  const player = toss.player;
  const tossType = toss.toss_type;

  const prefix = fetchStrings(
    Region.System,
    context.matStore.isMe(player) ? 102 : 103,
  );

  const dice = tossType === MsgToss.TossType.DICE;
  if (!dice && tossType !== MsgToss.TossType.COIN) return;
  const results = [...toss.res];
  if (!results.length) return;
  playEffect(dice ? AudioActionType.SOUND_DICE : AudioActionType.SOUND_COIN);
  context.matStore.tossResult =
    prefix +
    fetchStrings(Region.System, dice ? 1624 : 1623) +
    results
      .map((x) => (dice ? String(x) : fetchStrings(Region.System, 61 - x)))
      .join(" / ");
  const duration = getDuration(dice ? MDPRO3.dice : MDPRO3.coin);
  // All pieces settle together, using only results supplied by the rules core.
  emitDuelCue({ kind: dice ? "dice" : "coin", results }, duration);
  await waitForAnimation(duration);
};
