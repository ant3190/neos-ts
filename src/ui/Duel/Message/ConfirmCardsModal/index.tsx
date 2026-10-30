import { proxy, useSnapshot } from "valtio";

import { type Option, SelectCardsModal } from "../SelectCardsModal";
import { PromptSession } from "../session";

const store = proxy({ isOpen: false, promptId: 0, cards: [] as Option[] });
const session = new PromptSession<void>();

/** Public cards are listed together. Closing only acknowledges the local display. */
export function ConfirmCardsModal() {
  const snap = useSnapshot(store);
  const promptId = store.promptId;
  if (!snap.isOpen) return null;
  const close = () => {
    if (!store.isOpen || store.promptId !== promptId) return;
    store.isOpen = false;
    session.settle();
  };
  return (
    <SelectCardsModal
      key={snap.promptId}
      readOnly
      title={`确认展示卡片（共 ${snap.cards.length} 张）`}
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
      onSubmit={close}
      onCancel={close}
      onFinish={close}
    />
  );
}

export async function displayConfirmCardsModal(cards: Option[]) {
  if (!cards.length) return;
  const pending = session.begin();
  Object.assign(store, { isOpen: true, promptId: pending.id, cards });
  await pending.promise;
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
