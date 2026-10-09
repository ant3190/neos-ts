import { fetchCard, ygopro } from "@/api";
import { Container } from "@/container";
import { AudioActionType, playEffect } from "@/infra/audio";
import { callCardFocus } from "@/ui/Duel/PlayMat/Card";
import { requestCardImage } from "@/ui/Shared/YgoCard/imageCache";

import { fetchEsHintMeta } from "./util";

export default async (
  container: Container,
  chaining: ygopro.StocGameMessage.MsgChaining,
) => {
  playEffect(AudioActionType.SOUND_ACTIVATE);
  const context = container.context;
  fetchEsHintMeta({
    context,
    originMsg: "「[?]」被发动时",
    cardID: chaining.code,
  });

  const location = chaining.location;
  const target = context.cardStore.find(location);

  // 将`location`添加到连锁栈
  if (context.matStore.chainDetails.length === 0)
    context.matStore.completedChainDetails = [];
  context.matStore.chains.push(location);
  const detail = {
    id: ++context.matStore.chainEventId,
    index: context.matStore.chains.length,
    code: chaining.code,
    cardUuid: target?.uuid,
    controller: location.controller,
    zone: location.zone,
    resolved: false,
  };
  context.matStore.chainDetails.push(detail);
  context.matStore.chainActivation = detail;
  const meta = fetchCard(chaining.code);
  requestCardImage(chaining.code);
  context.historyStore.putEffect(context, meta.id, location);

  if (target) {
    // 设置连锁序号
    const block = context.placeStore.of(context, location);
    if (block) {
      block.chainIndex.push(context.matStore.chains.length);
    } else {
      console.warn(`<Chaining>block from ${location} is null`);
    }

    // 这里不能设置`code`，因为存在一个场景：
    // 对方的`魔神仪-曼德拉护肤草`发动效果后，后端会发一次`MSG_SHUFFLE_HAND`，
    // 但传给前端的codes全是0，如果这里设置了`code`的话，
    // 在后面的`MSG_SHUFFLE_HAND`处理就会有问题。
    // target.code = meta.id;

    // 设置`Meta`信息，让对手发动效果的卡也能展示正面卡图
    if (target.code === 0) {
      target.meta = meta;
    }

    // 发动效果动画
    await callCardFocus(target.uuid);
    console.color("blue")(`${target.meta.text.name} chaining`);
    console.info(
      `<Chaining>chain stack length = ${context.matStore.chains.length}`,
    );
  } else {
    console.warn(`<Chaining>target from ${location} is null`);
  }
};
