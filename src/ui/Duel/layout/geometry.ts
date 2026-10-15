import { ygopro } from "@/api/ocgcore/idl/ocgcore";

/**
 * MDPro3 GameCard.GetCardPosition and CameraManager, upstream e177cd8d.
 * World X/Z form the table; world Y is elevation. One world unit is 20 CSS px.
 * Keep these coordinates shared by the slots, moving cards and HUD anchors.
 */
export const DUEL_WIDTH = 1920;
export const DUEL_HEIGHT = 1080;
export const WORLD_UNIT = 20;
export const CARD_HEIGHT = 8.6 * WORLD_UNIT;
export const CARD_RATIO = 5.9 / 8.6;
export const CAMERA_PITCH = 70;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const pitch = radians(CAMERA_PITCH);
export const CAMERA_FOCAL_LENGTH = DUEL_HEIGHT / (2 * Math.tan(radians(15)));
const distance = 95 / Math.sin(pitch);
export const CAMERA_GROUND_Z = -37 + distance * Math.cos(pitch);
export const CAMERA_PLANE_DEPTH = CAMERA_FOCAL_LENGTH - distance * WORLD_UNIT;

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
  viewport = { width: DUEL_WIDTH, fov: 30 },
) {
  const focal = DUEL_HEIGHT / (2 * Math.tan(radians(viewport.fov / 2)));
  const y = point.y - 95;
  const z = point.z + 37;
  const depth = -Math.sin(pitch) * y + Math.cos(pitch) * z;
  return {
    x: viewport.width / 2 + (focal * point.x) / depth,
    y:
      DUEL_HEIGHT / 2 -
      (focal * (Math.cos(pitch) * y + Math.sin(pitch) * z)) / depth,
  };
}

export function zoneWorldPosition(
  location: TableLocation,
  mine: boolean,
  handCount = 0,
  aspect = 16 / 9,
): WorldPoint {
  const { zone, sequence } = location;
  let x = 0,
    y = 0.2,
    z = 0;
  switch (zone) {
    case ZONE.HAND:
      x = sequence * 4 - (handCount - 1) * 2;
      y = 15;
      const clamp = (value: number) => Math.max(0, Math.min(1, value));
      const outward =
        1.6 * clamp((aspect - 16 / 9) / (5 / 9)) +
        1.1 * clamp((aspect - 21 / 9) / (11 / 9));
      z =
        (mine ? -28 : -17) -
        outward -
        Math.abs(x) * (Math.abs(x) * 0.0055 + 0.08);
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
  aspect = 16 / 9,
): TablePose {
  const world = zoneWorldPosition(location, mine, handCount, aspect);
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
    rx: hand ? -20 : 0,
    ry: faceDown ? 180 : 0,
    rz:
      (mine ? 0 : 180) +
      rotation +
      (hand
        ? world.x * (1.2 - Math.abs(world.x) * 0.006) * (mine ? 1 : -1)
        : 0),
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
