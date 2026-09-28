import assert from "node:assert/strict";
import { test } from "node:test";

import { asyncStart } from "../src/ui/Duel/PlayMat/Card/springs/asyncStart.ts";

test("a stalled animation releases the duel and displays the card", async () => {
  const calls = [];
  const api = {
    start: () => {}, // Simulate a browser that never delivers another animation frame.
    stop: () => calls.push("stop"),
    set: (target) => calls.push(target),
  };

  await asyncStart(api)({ x: 120, scale: 1, config: { duration: 400 } });

  assert.deepEqual(calls, ["stop", { x: 120, scale: 1 }]);
});
