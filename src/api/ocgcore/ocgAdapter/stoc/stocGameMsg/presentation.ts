import { ygopro } from "../../../idl/ocgcore";

/** These engine notifications have no response and need no protobuf schema change. */
export type PresentationMessage =
  | { kind: "chained" | "solving" | "negated" | "disabled"; index: number }
  | { kind: "damage-start" | "damage-end" }
  | {
      kind: "battle";
      attacker: ygopro.CardLocation;
      target: ygopro.CardLocation;
      attackerAttack: number;
      attackerDefense: number;
      targetAttack: number;
      targetDefense: number;
    };

const notifications = new WeakMap<object, PresentationMessage>();

export function readPresentationMessage(
  command: number,
  bytes: Uint8Array,
): PresentationMessage | undefined {
  const chainKinds = {
    71: "chained",
    72: "solving",
    74: "negated",
    75: "disabled",
  } as const;
  const kind = chainKinds[command as keyof typeof chainKinds];
  if (kind) return bytes.length ? { kind, index: bytes[0] } : undefined;
  if (command === 113) return { kind: "damage-start" };
  if (command === 114) return { kind: "damage-end" };
  if (command !== 111 || bytes.length < 26) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const zoneCodes: Record<number, ygopro.CardZone> = {
    0: ygopro.CardZone.EMPTY,
    1: ygopro.CardZone.DECK,
    2: ygopro.CardZone.HAND,
    4: ygopro.CardZone.MZONE,
    8: ygopro.CardZone.SZONE,
    16: ygopro.CardZone.GRAVE,
    32: ygopro.CardZone.REMOVED,
    64: ygopro.CardZone.EXTRA,
  };
  const location = (offset: number) =>
    new ygopro.CardLocation({
      controller: view.getUint8(offset),
      zone: zoneCodes[view.getUint8(offset + 1)],
      sequence: view.getUint8(offset + 2),
    });
  // MDPro3 reads short GPS + one position byte, ATK, DEF and one damage flag per side.
  const attacker = location(0);
  const attackerAttack = view.getInt32(4, true);
  const attackerDefense = view.getInt32(8, true);
  const target = location(13);
  const targetAttack = view.getInt32(17, true);
  const targetDefense = view.getInt32(21, true);
  return {
    kind: "battle",
    attacker,
    target,
    attackerAttack,
    attackerDefense,
    targetAttack,
    targetDefense,
  };
}

export function attachPresentationMessage(
  msg: object,
  event: PresentationMessage,
) {
  notifications.set(msg, event);
}

export const getPresentationMessage = (msg: object) => notifications.get(msg);
