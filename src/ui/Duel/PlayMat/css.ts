import { CARD_HEIGHT, TABLE_SCALE } from "../layout/geometry";

// 此文件目的是在js和CSS之间共享一些变量。
type CSSConfig = [string, [number, UNIT]][];

/** 转为CSS变量: BOARD_ROTATE_Z -> --board-rotate-z */
const toCssProperties = (config: CSSConfig) =>
  config
    .map(
      ([k, v]) =>
        [
          `--${k
            .split("_")
            .map((s) => s.toLowerCase())
            .join("-")}`,
          `${v[0]}${v[1]}`,
        ] as [string, string],
    )
    .reduce((acc, cur) => [...acc, cur], [] as [string, string][]);

enum UNIT {
  PX = "px",
  DEG = "deg",
  NONE = "",
}

const _matConfigWithUnit: Record<string, [number, UNIT]> = {
  TABLE_SCALE: [TABLE_SCALE, UNIT.NONE],
  PLANE_ROTATE_X: [0, UNIT.DEG],
  BLOCK_WIDTH: [172, UNIT.PX],
  BLOCK_HEIGHT_M: [172, UNIT.PX],
  BLOCK_HEIGHT_S: [172, UNIT.PX],
  ROW_GAP: [0, UNIT.PX],
  COL_GAP: [0, UNIT.PX],
  CARD_RATIO: [5.9 / 8.6, UNIT.NONE],
  HAND_MARGIN_TOP: [0, UNIT.PX],
  HAND_CIRCLE_CENTER_OFFSET_Y: [6000, UNIT.PX],
  HAND_CARD_HEIGHT: [CARD_HEIGHT, UNIT.PX],
  HAND_MAT_OFFSET_Y: [140, UNIT.PX], // 手卡离场地的偏移
  DECK_OFFSET_X: [140, UNIT.PX],
  DECK_OFFSET_Y: [80, UNIT.PX],
  DECK_ROTATE_Z: [19.5, UNIT.DEG],
  DECK_CARD_HEIGHT: [CARD_HEIGHT * 0.9, UNIT.PX],
  CARD_HEIGHT_O: [CARD_HEIGHT, UNIT.PX],
  BLOCK_OUTSIDE_OFFSET_X: [15, UNIT.PX],
};

const matConfigWithUnit = Object.entries(
  _matConfigWithUnit,
) satisfies CSSConfig;

export function setCssProperties() {
  toCssProperties(matConfigWithUnit).forEach(([k, v]) => {
    document.body.style.setProperty(k, v);
  });
}

export const matConfig = matConfigWithUnit.reduce(
  (prev, [key, value]) => ({
    ...prev,
    // @ts-ignore
    [key]: value[0],
  }),
  {} as Record<keyof typeof _matConfigWithUnit, number>,
);
