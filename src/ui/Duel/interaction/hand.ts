import { proxy } from "valtio";

/** Shared by the pointer gesture and the hand's spring destinations. */
export const handInteraction = proxy({
  offset: 0,
  dragging: false,
  selected: "",
});
let suppressClickUntil = 0;
export function suppressHandClick() {
  suppressClickUntil = performance.now() + 150;
}
export function handClickSuppressed() {
  return handInteraction.dragging || performance.now() < suppressClickUntil;
}
export function resetHandInteraction() {
  handInteraction.offset = 0;
  handInteraction.dragging = false;
  handInteraction.selected = "";
  suppressClickUntil = 0;
}
