import assert from "node:assert/strict";
import test from "node:test";

import { ygopro } from "../src/api/ocgcore/idl/ocgcore.ts";
import { readPresentationMessage } from "../src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/presentation.ts";
import {
  cardMotionState,
  revealPublicCardFace,
} from "../src/ui/Duel/animation/motionState.ts";
import { cardMotionPlan } from "../src/ui/Duel/animation/motionRules.ts";
import {
  projectWorld,
  tablePose,
  zoneWorldPosition,
} from "../src/ui/Duel/layout/geometry.ts";
import { legalPhaseCommands } from "../src/ui/Duel/interaction/phaseRules.ts";

const Z = ygopro.CardZone,
  P = ygopro.CardPosition;
test("protobuf enums, rather than engine bit masks, identify zones and positions", () => {
  assert.deepEqual(zoneWorldPosition({ zone: Z.MZONE, sequence: 2 }, true), {
    x: 0,
    y: 0.2,
    z: -9.48,
  });
  assert.equal(
    tablePose({ zone: Z.MZONE, sequence: 2, position: P.FACEUP_DEFENSE }, true)
      .ry,
    0,
  );
  assert.equal(
    tablePose({ zone: Z.MZONE, sequence: 2, position: P.FACEUP_DEFENSE }, true)
      .rz,
    90,
  );
  assert.equal(
    tablePose(
      { zone: Z.EXTRA, sequence: 0, position: P.FACEDOWN },
      true,
      0,
      true,
    ).ry,
    180,
  );
});
test("opposing extra monster slots share the same world position", () => {
  const a = zoneWorldPosition({ zone: Z.MZONE, sequence: 5 }, true);
  const b = zoneWorldPosition({ zone: Z.MZONE, sequence: 6 }, false);
  assert.ok(Math.abs(a.x - b.x) < 1e-8);
  assert.ok(Math.abs(a.z - b.z) < 1e-8);
  const center = projectWorld({ x: 0, y: 0, z: 0 });
  assert.equal(center.x, 960);
  assert.equal(center.y, 540);
});
test("motion categories preserve MDPro3 event-specific travel and departure rules", () => {
  assert.equal(
    cardMotionPlan({ fromZone: Z.DECK, toZone: Z.HAND, mine: true }).duration,
    500,
  );
  assert.equal(
    cardMotionPlan({ fromZone: Z.DECK, toZone: Z.HAND, mine: false }).duration,
    250,
  );
  assert.equal(
    cardMotionPlan({ fromZone: Z.MZONE, toZone: Z.GRAVE, reason: 1 }).kind,
    "destroy",
  );
  assert.equal(
    cardMotionPlan({ fromZone: Z.MZONE, toZone: Z.GRAVE, reason: 8 }).depart,
    true,
  );
  assert.equal(
    cardMotionPlan({
      fromZone: Z.HAND,
      toZone: Z.SZONE,
      toPosition: P.FACEDOWN,
    }).kind,
    "set",
  );
  assert.equal(
    cardMotionPlan({ fromZone: Z.MZONE, toZone: Z.MZONE, positionOnly: true })
      .duration,
    200,
  );
});
test("phase legality and wire encodings belong to the pending command", () => {
  const flags = { enableBp: true, enableM2: true, enableEp: true };
  const battle = legalPhaseCommands("battle", flags);
  assert.equal(battle.find((c) => c.key === "battle").enabled, false);
  assert.equal(battle.find((c) => c.key === "end").response, 3);
  assert.equal(
    legalPhaseCommands("idle", flags).find((c) => c.key === "end").response,
    7,
  );
  assert.ok(legalPhaseCommands(undefined, flags).every((c) => !c.enabled));
});

test("raw player/card hints respect byte offsets and engine location codes", () => {
  const buffer = new Uint8Array(12);
  const payload = buffer.subarray(3, 9);
  payload[0] = 1;
  payload[1] = 6;
  new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  ).setUint32(2, 46986414 * 16, true);
  assert.deepEqual(readPresentationMessage(165, payload), {
    kind: "player-hint",
    player: 1,
    hintType: 6,
    value: 46986414 * 16,
  });
  const cardHint = new Uint8Array([1, 4, 2, 1, 5, 9, 0, 0, 0]);
  const hint = readPresentationMessage(160, cardHint);
  assert.equal(hint.kind, "card-hint");
  assert.equal(hint.location.zone, Z.MZONE);
  assert.equal(hint.location.controller, 1);
  assert.equal(hint.location.sequence, 2);
  assert.equal(hint.value, 9);
  assert.equal(
    readPresentationMessage(160, cardHint.subarray(0, 8)),
    undefined,
  );
  assert.equal(readPresentationMessage(165, payload.subarray(0, 5)), undefined);
});

test("an old reveal cannot conceal a newer public event for the same card", () => {
  const first = revealPublicCardFace("hidden-hand", 46986414);
  const second = revealPublicCardFace("hidden-hand", 100000001);
  first();
  assert.equal(cardMotionState.revealed["hidden-hand"].code, 100000001);
  second();
  assert.equal(cardMotionState.revealed["hidden-hand"], undefined);
});

test("hands are straight and elevation cannot change the orthographic scale", () => {
  const hands = Array.from({ length: 8 }, (_, sequence) =>
    tablePose({ zone: Z.HAND, sequence }, true, 8),
  );
  assert.equal(new Set(hands.map((p) => p.y)).size, 1);
  assert.ok(hands.every((p) => p.rz === 0 && p.rx === 0));
  assert.deepEqual(
    projectWorld({ x: 10, y: 0, z: -9.48 }),
    projectWorld({ x: 10, y: 50, z: -9.48 }),
  );
  assert.equal(
    tablePose({ zone: Z.MZONE, sequence: 0 }, true).scale,
    tablePose({ zone: Z.MZONE, sequence: 0 }, false).scale,
  );
});
