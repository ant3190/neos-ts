import { cardStore } from "@/stores";

let selection: { id: symbol; choose: (uuid: string) => void } | undefined;
export function registerFieldSelection(choose: (uuid: string) => void) {
  const id = Symbol("field-selection");
  selection = { id, choose };
  return () => {
    if (selection?.id === id) resetFieldSelection();
  };
}
export function trySelectFieldCard(uuid: string) {
  if (!selection) return false;
  selection.choose(uuid);
  return true;
}
export function resetFieldSelection() {
  if (!selection) return;
  selection = undefined;
  for (const card of cardStore.inner) {
    card.selectInfo.selectable = false;
    card.selectInfo.selected = false;
  }
}
