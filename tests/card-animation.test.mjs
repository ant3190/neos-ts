import assert from "node:assert/strict";
import { test } from "node:test";

import {
  asyncStart,
  resetAnimationStall,
} from "../src/ui/Duel/PlayMat/Card/springs/asyncStart.ts";
import { animationSettings } from "../src/ui/Duel/animation/runtime.ts";

test("a newly shown card reaches its position without waiting for frames", async () => {
  const calls = [];
  const api = {
    start: () => calls.push("animated"),
    set: (target) => calls.push(target),
  };

  await asyncStart(api)({ x: 120, scale: 1, config: { duration: 0 } });
  assert.deepEqual(calls, [{ x: 120, scale: 1 }]);
});

test("a stalled animation releases the duel and displays the card", async () => {
  const calls = [];
  const api = {
    start: () => {}, // Simulate a browser that never delivers another animation frame.
    stop: () => calls.push("stop"),
    set: (target) => calls.push(target),
  };

  const start = Date.now();
  await asyncStart(api)({ x: 120, scale: 1, config: { duration: 400 } });

  assert.deepEqual(calls, ["stop", { x: 120, scale: 1 }]);
  assert.ok(Date.now() - start < 1800);

  const nextStart = Date.now();
  await asyncStart(api)({ x: 180, scale: 1, config: { duration: 400 } });
  assert.deepEqual(calls.at(-1), { x: 180, scale: 1 });
  assert.ok(Date.now() - nextStart < 100);
});

test("starting a new duel restores animations after an earlier stall", async () => {
  resetAnimationStall();
  const calls = [];
  const api = {
    set: () => calls.push("set"),
    start: (options) => {
      calls.push("animated");
      options.onResolve();
    },
  };
  await asyncStart(api)({ x: 50, config: { duration: 100 } });
  assert.deepEqual(calls, ["animated"]);
});

test("reduced motion, hidden tabs and lite mode settle or bound card movements", async () => {
  resetAnimationStall();
  const before = {
    mode: animationSettings.mode,
    reduced: animationSettings.reduced,
  };
  const calls = [];
  const api = {
    set: (target) => calls.push(target),
    start: (options) => {
      calls.push(options.config.duration);
      options.onResolve();
    },
  };
  try {
    animationSettings.reduced = true;
    await asyncStart(api)({ x: 10, config: { duration: 400 } });
    assert.deepEqual(calls.at(-1), { x: 10 });
    animationSettings.reduced = false;
    globalThis.document = { hidden: true };
    await asyncStart(api)({ x: 20, config: { duration: 400 } });
    assert.deepEqual(calls.at(-1), { x: 20 });
    globalThis.document.hidden = false;
    animationSettings.mode = "lite";
    await asyncStart(api)({ x: 30, config: { duration: 400 } });
    assert.equal(calls.at(-1), 150);
  } finally {
    delete globalThis.document;
    Object.assign(animationSettings, before);
  }
});
