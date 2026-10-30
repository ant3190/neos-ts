import { fetchCard, ygopro } from "@/api";
import { Container } from "@/container";
import { isCurrentUIContainer } from "@/container/compat";
import { AudioActionType, playEffect } from "@/infra/audio";
import { displayConfirmCardsModal } from "@/ui/Duel/Message/ConfirmCardsModal";
import { requestCardImage } from "@/ui/Shared/YgoCard/imageCache";

/** Reveal payloads own their public identities, even without a mounted pile card. */
export default async (
  container: Container,
  confirm: ygopro.StocGameMessage.MsgConfirmCards,
) => {
  if (!isCurrentUIContainer(container) || !confirm.cards.length) return;
  const context = container.context;
  const cards = confirm.cards.map((info) => {
    const target = context.cardStore.at(
      info.location,
      info.controller,
      info.sequence,
    );
    const code = info.code || target?.code || 0;
    const location = new ygopro.CardLocation({
      controller: info.controller,
      zone: info.location,
      sequence: info.sequence,
    });
    requestCardImage(code);
    if (code) context.historyStore.putConfirmed(context, code, location);
    return { meta: fetchCard(code), location };
  });
  const only = confirm.cards.length === 1 ? confirm.cards[0] : undefined;
  if (
    only?.location === ygopro.CardZone.HAND &&
    context.matStore.isMe(only.controller) &&
    !!only.code &&
    context.cardStore.at(only.location, only.controller, only.sequence)
      ?.code === only.code
  )
    return;
  playEffect(AudioActionType.SOUND_REVEAL);
  void displayConfirmCardsModal(cards);
};
