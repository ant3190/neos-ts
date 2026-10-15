import { settingStore } from "@/stores/settingStore";

export { asyncStart } from "./asyncStart";

export function getDuration(baseMs = 250): number {
  const MAX_DURATION = 400;
  const { speed } = settingStore.animation;

  return ((MAX_DURATION - speed * 300) * baseMs) / 250;
}
