import { settingStore } from "@/stores/settingStore";

export { asyncStart } from "./asyncStart";

export function getDuration(baseMs = 250): number {
  const { speed } = settingStore.animation;
  // The existing default slider position (0.7) is MDPro3's original duration.
  return baseMs * (1.7 - Math.max(0, Math.min(1, speed)));
}
