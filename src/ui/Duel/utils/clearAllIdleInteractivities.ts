import { cardStore, matStore } from "@/stores";

export function clearAllIdleInteractivities() {
  matStore.commandSource = undefined;
  matStore.commandPlayer = undefined;
  matStore.phase.enableBp = false;
  matStore.phase.enableM2 = false;
  matStore.phase.enableEp = false;
  for (const card of cardStore.inner) {
    card.idleInteractivities = [];
  }
}
