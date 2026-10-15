import { proxy } from "valtio";

const key = "neos:duel-auto-info";
export const duelPreferences = proxy({
  autoInfo:
    typeof localStorage === "undefined" ||
    localStorage.getItem(key) !== "false",
});
export function setAutoInfo(enabled: boolean) {
  duelPreferences.autoInfo = enabled;
  localStorage.setItem(key, String(enabled));
}
