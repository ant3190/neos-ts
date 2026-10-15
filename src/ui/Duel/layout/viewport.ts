import { type RefObject, useLayoutEffect } from "react";
import { proxy } from "valtio";

import {
  CAMERA_FOCAL_LENGTH,
  CAMERA_PLANE_DEPTH,
  DUEL_HEIGHT,
} from "./geometry";

export const duelViewport = proxy({ width: 1920, fov: 30 });

/** Unity's height-matched CanvasScaler and desktop ultrawide FOV compensation. */
export function useDuelCamera(ref: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    const update = () => {
      const width = stage.clientWidth;
      const wide = Math.max(
        0,
        Math.min(1, (width / DUEL_HEIGHT - 16 / 9) / (16 / 9)),
      );
      const fov = 30 + 3 * wide;
      const focal = DUEL_HEIGHT / (2 * Math.tan((fov * Math.PI) / 360));
      duelViewport.width = width;
      duelViewport.fov = fov;
      stage.style.setProperty("--perspective", `${focal}px`);
      stage.style.setProperty(
        "--camera-plane-depth",
        `${CAMERA_PLANE_DEPTH + focal - CAMERA_FOCAL_LENGTH}px`,
      );
      window.dispatchEvent(new Event("neos:duel-camera-change"));
    };
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    update();
    return () => observer.disconnect();
  }, [ref]);
}
