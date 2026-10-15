import { useLayoutEffect } from "react";

const DESIGN_WIDTH = 1000;
const DESIGN_HEIGHT = 620;
const MIN_SCALE = 0.3;

export interface AdaptiveViewportScaleOptions {
  designWidth?: number;
  designHeight?: number;
  minScale?: number;
  duel?: boolean;
}

const setViewportScale = ({
  designWidth = DESIGN_WIDTH,
  designHeight = DESIGN_HEIGHT,
  minScale = MIN_SCALE,
  duel = false,
}: AdaptiveViewportScaleOptions = {}) => {
  const viewportWidth = Math.max(window.innerWidth, 1);
  const viewportHeight = Math.max(window.innerHeight, 1);
  const scale = Math.max(
    minScale,
    duel
      ? viewportWidth < viewportHeight
        ? viewportWidth / designWidth
        : viewportHeight / designHeight
      : Math.min(1, viewportWidth / designWidth, viewportHeight / designHeight),
  );
  const roundedScale = Number(scale.toFixed(4));
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty("--neos-adaptive-scale", `${roundedScale}`);
  rootStyle.setProperty(
    "--neos-adaptive-width",
    `${viewportWidth / roundedScale}px`,
  );
  rootStyle.setProperty(
    "--neos-adaptive-height",
    `${viewportHeight / roundedScale}px`,
  );
};

export const useAdaptiveViewportScale = (
  options?: AdaptiveViewportScaleOptions,
) => {
  const designWidth = options?.designWidth;
  const designHeight = options?.designHeight;
  const minScale = options?.minScale;
  const duel = options?.duel;

  useLayoutEffect(() => {
    let frame = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setViewportScale({ designWidth, designHeight, minScale, duel }),
      );
    };

    setViewportScale({ designWidth, designHeight, minScale, duel });
    window.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
    };
  }, [designWidth, designHeight, minScale, duel]);
};
