import { ygopro } from "@/api/ocgcore/idl/ocgcore";

/** Shared orthographic table coordinates; elevation only controls stacking. */
export const DUEL_WIDTH = 1920;
export const DUEL_HEIGHT = 1080;
export const WORLD_UNIT = 20;
export const TABLE_SCALE = 0.8;
export const CARD_HEIGHT = 8.6 * WORLD_UNIT;
export const CARD_RATIO = 5.9 / 8.6;

const ZONE = ygopro.CardZone;
export const isFaceDownPosition = (position?: number) =>
  [
    ygopro.CardPosition.FACEDOWN,
    ygopro.CardPosition.FACEDOWN_ATTACK,
    ygopro.CardPosition.FACEDOWN_DEFENSE,
  ].includes(position ?? ygopro.CardPosition.FACEUP_ATTACK);
const isDefensePosition = (position: number) =>
  [
    ygopro.CardPosition.DEFENSE,
    ygopro.CardPosition.FACEUP_DEFENSE,
    ygopro.CardPosition.FACEDOWN_DEFENSE,
  ].includes(position);

export interface TableLocation {
  zone: number;
  sequence: number;
  position?: number;
  is_overlay?: boolean;
  overlay_sequence?: number;
}
export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}
export interface TablePose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  zIndex: number;
}

export function projectWorld(
  point: WorldPoint,
  viewport = { width: DUEL_WIDTH },
) {
  return {
    x: viewport.width / 2 + point.x * WORLD_UNIT * TABLE_SCALE,
    y: DUEL_HEIGHT / 2 - point.z * WORLD_UNIT * TABLE_SCALE,
  };
}

export function zoneWorldPosition(
  location: TableLocation,
  mine: boolean,
  handCount = 0,
): WorldPoint {
  const { zone, sequence } = location;
  let x = 0,
    y = 0.2,
    z = 0;
  switch (zone) {
    case ZONE.HAND:
      const step = handCount <= 10 ? 6.4 : 4.4;
      x = (sequence - (handCount - 1) / 2) * step;
      y = 15;
      z = -28.5;
      break;
    case ZONE.DECK:
    case ZONE.EXTRA:
      x = zone === ZONE.DECK ? 26.6 : -26.6;
      y = 1.5 + sequence * 0.11;
      z = -23.5;
      break;
    case ZONE.GRAVE:
      x = 25.74;
      y = 5;
      z = -14.26;
      break;
    case ZONE.REMOVED:
      x = 25.74 + 1.842971;
      y = 5;
      z = -14.26 + 6.236011;
      break;
    case ZONE.MZONE:
      x = sequence > 4 ? (sequence === 5 ? -8.6 : 8.6) : (sequence - 2) * 8.6;
      z = sequence > 4 ? 0 : mine ? -9.48 : -9.51;
      break;
    case ZONE.SZONE:
      x =
        sequence === 5
          ? -25
          : (sequence > 5 ? (sequence === 6 ? -1 : 1) : sequence - 2) * 8.6;
      z = sequence === 5 ? -10 : -18;
      break;
  }
  if (!mine) {
    x = -x;
    z = -z;
  }
  if (location.is_overlay) {
    const index = location.overlay_sequence ?? 0;
    x += (index + 1) * 0.2;
    y -= (index + 2) * 0.02;
  }
  return { x, y, z };
}

export function tablePose(
  location: TableLocation,
  mine: boolean,
  handCount = 0,
  known = true,
): TablePose {
  const world = zoneWorldPosition(location, mine, handCount);
  const { zone, sequence, position = 0 } = location;
  const hand = zone === ZONE.HAND;
  const stack = zone === ZONE.DECK || zone === ZONE.EXTRA;
  const defense =
    isDefensePosition(position) && (zone === ZONE.MZONE || zone === ZONE.SZONE);
  const faceDown = hand
    ? !known
    : stack
    ? !known || isFaceDownPosition(position)
    : isFaceDownPosition(position);
  const rotation = stack
    ? zone === ZONE.DECK
      ? -19.5
      : 19.5
    : zone === ZONE.REMOVED
    ? 90
    : defense
    ? 90
    : 0;
  return {
    x: world.x * WORLD_UNIT,
    y: -world.z * WORLD_UNIT,
    z: world.y * WORLD_UNIT,
    rx: 0,
    ry: faceDown ? 180 : 0,
    rz: (mine ? 0 : 180) + rotation,
    scale: zone === ZONE.SZONE ? 0.8 : stack ? 0.9 : 1,
    zIndex: location.is_overlay
      ? 1
      : hand
      ? sequence + 10
      : stack
      ? sequence
      : 3,
  };
}
