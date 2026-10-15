import { type RefObject, useLayoutEffect } from "react";
import { proxy } from "valtio";

export const duelViewport = proxy({ width: 1920, scale: 1, left: 0, top: 0 });

/** Measure canvas-to-viewport coordinates for the unscaled control layer. */
export function useDuelCamera(ref: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    let frame = 0;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      const scale = Math.max(0.01, rect.height / 1080);
      stage.style.setProperty(
        "--duel-controls-reserve",
        `${Math.max(0, (rect.bottom - window.innerHeight + 72) / scale)}px`,
      );
      const visibleTop = Math.max(0, -rect.top) / scale;
      const visibleBottom =
        Math.max(0, rect.bottom - window.innerHeight) / scale;
      stage.style.setProperty("--duel-visible-top", `${visibleTop}px`);
      stage.style.setProperty("--duel-visible-bottom", `${visibleBottom}px`);
      stage.style.setProperty(
        "--duel-dialog-height",
        `${rect.height / scale - visibleTop - visibleBottom}px`,
      );
      stage.style.setProperty(
        "--duel-effect-font",
        `${Math.max(26, 18 / scale)}px`,
      );
      Object.assign(duelViewport, {
        width: stage.clientWidth,
        scale,
        left: rect.left,
        top: rect.top,
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(stage);
    window.addEventListener("resize", schedule);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}
