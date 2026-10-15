import { proxy } from "valtio";

/** MDPro3 temporarily hides the log while a pile is inspected. */
export const duelPanels = proxy({
  right: "none" as "none" | "pile" | "history" | "effects",
  restoreHistory: false,
  attachedEffects: {} as Record<number, number>,
  cardHints: {} as Record<string, { type: number; value: number }[]>,
  cannotCheckGrave: false,
});
export function openPilePanel() {
  if (duelPanels.right === "history") duelPanels.restoreHistory = true;
  else if (duelPanels.right === "none") duelPanels.restoreHistory = false;
  duelPanels.right = "pile";
}
export function closePilePanel() {
  duelPanels.right = duelPanels.restoreHistory ? "history" : "none";
  duelPanels.restoreHistory = false;
}
export function resetDuelPanels() {
  duelPanels.right = "none";
  duelPanels.restoreHistory = false;
  duelPanels.attachedEffects = {};
  duelPanels.cardHints = {};
  duelPanels.cannotCheckGrave = false;
}
export function toggleAttachedEffects() {
  if (duelPanels.right === "effects") closePilePanel();
  else {
    openPilePanel();
    duelPanels.right = "effects";
  }
}
