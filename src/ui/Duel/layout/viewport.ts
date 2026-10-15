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
