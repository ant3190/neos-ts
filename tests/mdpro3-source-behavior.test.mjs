import assert from "node:assert/strict";
import { test } from "node:test";

import { ygopro } from "../src/api/ocgcore/idl/ocgcore.ts";
import {
  MDPRO3,
  highSummon,
  battleTiming,
  summonTiming,
} from "../src/ui/Duel/animation/mdpro3.ts";
import {
  animationSettings,
  cancelAnimationWaits,
  waitForAnimation,
} from "../src/ui/Duel/animation/runtime.ts";
import {
  selectionCanComplete,
  selectionValid,
} from "../src/ui/Duel/interaction/selectionRules.ts";
import {
  tablePose,
  zoneWorldPosition,
} from "../src/ui/Duel/layout/geometry.ts";

test("banished piles sit above the grave on the same column and mirror with their hit geometry", () => {
  const Z = ygopro.CardZone,
    P = ygopro.CardPosition;
  const mine = zoneWorldPosition({ zone: Z.REMOVED, sequence: 0 }, true);
  const op = zoneWorldPosition({ zone: Z.REMOVED, sequence: 0 }, false);
  const grave = zoneWorldPosition({ zone: Z.GRAVE, sequence: 0 }, true);
  assert.equal(mine.x, grave.x);
  assert.ok(mine.z > grave.z + 8.6);
  assert.equal(op.x, -mine.x);
  assert.equal(op.z, -mine.z);
  assert.equal(
    tablePose({ zone: Z.REMOVED, sequence: 0, position: P.FACEUP_ATTACK }, true)
      .rz,
    0,
  );
  assert.equal(
    tablePose(
      { zone: Z.REMOVED, sequence: 0, position: P.FACEUP_ATTACK },
      false,
    ).rz,
    180,
  );
});

test("source timing boundaries retain the 2000 ATK attack and strong drop branches", () => {
  const total = (t) => Object.values(t).reduce((n, v) => n + v, 0);
  assert.equal(total(battleTiming(1999)), 1000);
  assert.equal(total(battleTiming(2000)), 1250);
  assert.equal(total(summonTiming(false)), 600);
  assert.equal(total(summonTiming(true)), 800);
  assert.equal(total(MDPRO3.activate), 1100);
  assert.equal(total(MDPRO3.confirm), 1000);
  assert.equal(MDPRO3.coin, 3000);
  assert.equal(MDPRO3.dice, 2000);
});

test("a double tribute satisfies two contributions without inventing a second selected card", () => {
  assert.equal(
    selectionValid([{ level1: 2 }], [], 2, 2, false, 0, true, true),
    true,
  );
  assert.equal(
    selectionValid([{ level1: 1 }], [], 2, 2, false, 0, true, true),
    false,
  );
  assert.equal(
    selectionValid(
      [{ level1: 2 }, { level1: 1 }],
      [],
      2,
      1,
      false,
      0,
      true,
      true,
    ),
    false,
  );
});

test("strong summons follow levels, ranks and link arrows rather than attack points", () => {
  assert.equal(highSummon(6, "normal"), false);
  assert.equal(highSummon(7, "normal"), true);
  assert.equal(highSummon(3, "xyz"), false);
  assert.equal(highSummon(4, "xyz"), true);
  assert.equal(highSummon(0, "link", 0b000000101), false);
  assert.equal(highSummon(0, "link", 0b000010101), false); // center is not a link arrow
  assert.equal(highSummon(0, "link", 0b100000101), true);
});

test("exact sums allow mixed levels and disable candidates with no legal completion", () => {
  assert.equal(
    selectionCanComplete(
      [{ level1: 2, level2: 4 }],
      [{ level1: 3, level2: 5 }],
      [],
      2,
      2,
      7,
      false,
    ),
    true,
  );
  assert.equal(
    selectionCanComplete([{ level1: 6 }], [{ level1: 3 }], [], 1, 2, 8, false),
    false,
  );
  assert.equal(
    selectionCanComplete([{ level1: 5 }], [], [{ level1: 3 }], 1, 2, 8, false),
    true,
  );
  assert.equal(
    selectionCanComplete([{ level1: 8 }], [], [], 2, 2, 8, false),
    false,
  );
  assert.equal(
    selectionCanComplete([{ level1: 9 }], [], [], 1, 2, 8, true),
    true,
  );
});

test("animation holds settle at the deadline and cancel on a duel reset", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const mode = animationSettings.mode;
  animationSettings.mode = "full";
  try {
    let done = false;
    const pending = waitForAnimation(700).then((value) => {
      done = true;
      return value;
    });
    t.mock.timers.tick(699);
    await Promise.resolve();
    assert.equal(done, false);
    t.mock.timers.tick(1);
    assert.equal(await pending, true);
    const cancelled = waitForAnimation(3000);
    cancelAnimationWaits();
    assert.equal(await cancelled, false);
    animationSettings.mode = "off";
    assert.equal(await waitForAnimation(3000), true);
  } finally {
    cancelAnimationWaits();
    animationSettings.mode = mode;
  }
});
