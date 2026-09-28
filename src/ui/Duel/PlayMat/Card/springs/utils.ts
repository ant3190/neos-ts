import { settingStore } from "@/stores/settingStore";

export { asyncStart } from "./asyncStart";

export function getDuration(): number {
  const MAX_DURATION = 400;
  const { speed } = settingStore.animation;

  return MAX_DURATION - speed * 300;
}
