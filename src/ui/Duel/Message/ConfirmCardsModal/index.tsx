import { useEffect } from "react";
import { proxy, useSnapshot } from "valtio";

import { type Option, SelectCardsModal } from "../SelectCardsModal";
import { duelInputState, hasDuelPrompt, PromptSession } from "../session";

const store = proxy({ isOpen: false, promptId: 0, cards: [] as Option[] });
const session = new PromptSession<void>();

function close(promptId: number) {
  if (!store.isOpen || store.promptId !== promptId) return;
  store.isOpen = false;
  session.settle();
}

/** Public information never requests a decision or pauses engine messages. */
export function ConfirmCardsModal() {
  const snap = useSnapshot(store);
  const { prompts } = useSnapshot(duelInputState);
  const promptId = snap.promptId;
  useEffect(() => {
    if (prompts) close(promptId);
  }, [prompts, promptId]);
  if (!snap.isOpen) return null;
  const dismiss = () => close(promptId);
  return (
    <SelectCardsModal
      key={snap.promptId}
      readOnly
      title={`展示卡片（共 ${snap.cards.length} 张）`}
      isOpen={snap.isOpen}
      min={0}
      max={0}
      single={false}
      selecteds={[]}
      mustSelects={[]}
      selectables={snap.cards}
      cancelable={false}
      finishable={false}
      totalLevels={0}
      overflow
      onSubmit={dismiss}
      onCancel={dismiss}
      onFinish={dismiss}
    />
  );
}

export async function displayConfirmCardsModal(cards: Option[]) {
  if (!cards.length || hasDuelPrompt() || document.hidden) return;
  const pending = session.begin();
  Object.assign(store, { isOpen: true, promptId: pending.id, cards });
  const timer = setTimeout(
    () => close(pending.id),
    cards.length === 1 ? 1400 : 5000,
  );
  await pending.promise;
  clearTimeout(timer);
  if (session.current(pending.id)) {
    store.isOpen = false;
    store.cards = [];
  }
}

export function resetConfirmCardsModal() {
  session.reset();
  store.isOpen = false;
  store.cards = [];
}
