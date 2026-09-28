import assert from "node:assert/strict";
import { test } from "node:test";

import { asyncStart } from "../src/ui/Duel/PlayMat/Card/springs/asyncStart.ts";

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
