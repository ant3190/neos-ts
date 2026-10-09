import { proxy } from "valtio";

import { EffectTimeline } from "./timeline";

export type AnimationMode = "auto" | "full" | "lite" | "off";
export interface Point {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface DuelCue {
  kind:
    | "draw"
    | "summon"
    | "special"
    | "flip"
    | "set"
    | "destroy"
    | "grave"
    | "banish"
    | "return"
    | "material"
    | "release"
    | "target"
    | "position"
    | "impact"
    | "shuffle"
    | "activate"
    | "reveal"
    | "resolve"
    | "negate"
    | "chain"
    | "phase"
    | "turn"
    | "life"
    | "result";
  duration: number;
  /** Lifetime follows engine messages; duration is only the entrance animation. */
  live?: boolean;
  code?: number;
  cardUuid?: string;
  negation?: "activation" | "effect";
  previousCode?: number;
  index?: number;
  chainId?: number;
  previousIndex?: number;
  label?: string;
  source?: string;
  opponent?: boolean;
  point?: Point;
  tone?: string;
  summonType?:
    | "fusion"
    | "synchro"
    | "xyz"
    | "link"
    | "pendulum"
    | "ritual"
    | "normal";
  materialCodes?: number[];
}

const MODE_KEY = "neos:duel-animation-mode";
const savedMode =
  typeof localStorage === "undefined" ? "auto" : localStorage.getItem(MODE_KEY);
export const animationSettings = proxy({
  mode: (["full", "lite", "off"].includes(savedMode ?? "")
    ? savedMode
    : "auto") as AnimationMode,
  degraded: false,
  reduced: false,
});
export const duelTimeline = new EffectTimeline<DuelCue>();
const elements = new Map<string, HTMLElement>();
const zones = new Map<string, HTMLElement>();

export function registerCardElement(uuid: string, element: HTMLElement | null) {
  if (element) elements.set(uuid, element);
  else elements.delete(uuid);
}
export function registerZoneElement(key: string, element: HTMLElement | null) {
  if (element) zones.set(key, element);
  else zones.delete(key);
}
export function getCardElement(uuid?: string): HTMLElement | undefined {
  const element = uuid ? elements.get(uuid) : undefined;
  return element?.isConnected ? element : undefined;
}
export function measureCard(
  uuid?: string,
  zoneKey?: string,
): Point | undefined {
  const element =
    getCardElement(uuid) ?? (zoneKey ? zones.get(zoneKey) : undefined);
  if (!element?.isConnected) return undefined;
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}
export function animationQuality(
  settings: {
    readonly mode: AnimationMode;
    readonly degraded: boolean;
    readonly reduced: boolean;
  } = animationSettings,
): "full" | "lite" | "off" {
  if (typeof document !== "undefined" && document.hidden) return "off";
  if (settings.reduced) return "off";
  return settings.mode === "auto"
    ? settings.degraded
      ? "lite"
      : "full"
    : settings.mode;
}
export function setAnimationMode(mode: AnimationMode) {
  animationSettings.mode = mode;
  localStorage.setItem(MODE_KEY, mode);
}
export function emitDuelCue(cue: Omit<DuelCue, "duration">, duration = 650) {
  if (typeof document !== "undefined" && document.hidden) return;
  // Preserve information in reduced motion mode; skip decorative field particles.
  if (
    animationQuality() === "off" &&
    cue.point &&
    !["life", "negate"].includes(cue.kind)
  )
    return;
  duelTimeline.emit({
    ...cue,
    duration:
      animationQuality() === "full" ? duration : Math.min(duration, 420),
  });
}
export function revealDuelCue(cue: Omit<DuelCue, "duration">, duration = 1050) {
  if (typeof document !== "undefined" && document.hidden) return;
  duelTimeline.reveal({
    ...cue,
    duration:
      animationQuality() === "full" ? duration : Math.min(duration, 750),
  });
}
export function showDuelResolution(cue: Omit<DuelCue, "duration" | "live">) {
  if (typeof document !== "undefined" && document.hidden) return;
  duelTimeline.showLive({ ...cue, live: true, duration: 150 });
}

/** Only samples while a cue is visible; no perpetual animation/render loop. */
export function startAnimationRuntime() {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const applyMotion = () => {
    animationSettings.reduced = media.matches;
  };
  applyMotion();
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  animationSettings.degraded =
    (navigator.hardwareConcurrency || 8) <= 4 || (deviceMemory ?? 8) <= 4;
  media.addEventListener("change", applyMotion);
  let frame = 0,
    last = 0,
    slow = 0,
    samples = 0;
  const sample = (time: number) => {
    frame = 0;
    if (last) {
      samples++;
      if (time - last > 35) slow++;
    }
    last = time;
    if (samples >= 30) {
      if (slow >= 8) animationSettings.degraded = true;
      samples = slow = 0;
    }
    const state = duelTimeline.getSnapshot();
    if (
      !document.hidden &&
      (state.cues.length || (state.reveal && !state.reveal.live))
    )
      frame = requestAnimationFrame(sample);
    else last = 0;
  };
  const wake = () => {
    if (!frame && !document.hidden && animationSettings.mode === "auto")
      frame = requestAnimationFrame(sample);
  };
  const unsubscribe = duelTimeline.subscribe(wake);
  const visibility = () => {
    if (document.hidden) duelTimeline.clear();
  };
  document.addEventListener("visibilitychange", visibility);
  return () => {
    cancelAnimationFrame(frame);
    unsubscribe();
    media.removeEventListener("change", applyMotion);
    document.removeEventListener("visibilitychange", visibility);
    duelTimeline.clear();
  };
}
