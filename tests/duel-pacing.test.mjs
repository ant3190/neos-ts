import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getDuelPacing,
  remainingDuelPace,
  waitForDuelPace,
} from "../src/service/duel/pacing.ts";

test("reading time includes existing movement and long activations rather than adding a full second wait", () => {
  const move = getDuelPacing("move");
  const activate = getDuelPacing("chaining");
  assert.equal(190 + remainingDuelPace(move, 190), 300);
  assert.equal(150 + remainingDuelPace(move, 150), 300);
  assert.equal(remainingDuelPace(move, 400), 80);
  assert.equal(380 + remainingDuelPace(activate, 380), 600);
  assert.equal(remainingDuelPace(activate, 1100), 80);
});

test("no frame renderer still yields between meaningful actions using bounded wall-clock timers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let finished = false;
  const action = waitForDuelPace(getDuelPacing("draw"), 0).then(() => {
    finished = true;
  });
  t.mock.timers.tick(379);
  await Promise.resolve();
  assert.equal(finished, false);
  t.mock.timers.tick(1);
  await action;
  assert.equal(finished, true);
});

test("state refreshes, input prompts and completed chain cleanup never add pacing delays", async () => {
  for (const event of [
    "update_data",
    "update_counter",
    "select_card",
    "select_chain",
    "select_idle_cmd",
    "chain_solved",
    "chain_end",
    "reload_field",
    "wait",
  ]) {
    assert.equal(remainingDuelPace(getDuelPacing(event), 0), 0, event);
    await waitForDuelPace(getDuelPacing(event), 0);
  }
  assert.equal(getDuelPacing("solving", 1), undefined);
  assert.equal(getDuelPacing("chained", 1), undefined);
  assert.equal(remainingDuelPace(getDuelPacing("solving", 3), 0), 240);
});

test("hiding the tab releases an active pause and subsequent hidden actions do not accumulate waits", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previousDocument = globalThis.document;
  const visibility = new EventTarget();
  visibility.hidden = false;
  globalThis.document = visibility;
  try {
    const pending = waitForDuelPace(getDuelPacing("chaining"), 0);
    visibility.hidden = true;
    visibility.dispatchEvent(new Event("visibilitychange"));
    await pending;
    await waitForDuelPace(getDuelPacing("move"), 0);
    t.mock.timers.tick(10000);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("paused replay steps skip additional pacing time", async () => {
  await waitForDuelPace(getDuelPacing("chaining"), 0, true);
});
