import assert from "node:assert/strict";
import { test } from "node:test";

import { eventbus, Task } from "../src/infra/eventbus.ts";

test("an animation requested before its card mounts runs once after registration", async () => {
  const pending = eventbus.call(Task.Move, "card-before-mount", {
    fromZone: 1,
  });
  const seen = [];
  const unsubscribe = eventbus.register(
    Task.Move,
    async (...args) => {
      seen.push(args);
      return true;
    },
    "card-before-mount",
  );
  await pending;
  assert.deepEqual(seen, [["card-before-mount", { fromZone: 1 }]]);
  unsubscribe();
});

test("animations go only to the matching card and can register again after unmount", async () => {
  const seen = [];
  const offA = eventbus.register(
    Task.Move,
    async () => {
      seen.push("a");
      return true;
    },
    "card-a",
  );
  const offB = eventbus.register(
    Task.Move,
    async () => {
      seen.push("b");
      return true;
    },
    "card-b",
  );
  await eventbus.call(Task.Move, "card-b");
  assert.deepEqual(seen, ["b"]);
  offA();
  offB();
  const pending = eventbus.call(Task.Move, "card-b");
  const offAgain = eventbus.register(
    Task.Move,
    async () => {
      seen.push("b again");
      return true;
    },
    "card-b",
  );
  await pending;
  assert.deepEqual(seen, ["b", "b again"]);
  offAgain();
});

test("an absent card does not block the duel forever", async () => {
  const previousWarn = console.warn;
  console.warn = () => {};
  try {
    await eventbus.call(Task.Focus, "never-mounted");
  } finally {
    console.warn = previousWarn;
  }
});

test("a promoted hidden card does not finish until its visible handler completes", async () => {
  const offHidden = eventbus.register(Task.Move, async () => false, "promoted");
  let completed = false;
  const pending = eventbus.call(Task.Move, "promoted").then(() => {
    completed = true;
  });
  await new Promise(setImmediate);
  assert.equal(completed, false);
  const seen = [];
  const offVisible = eventbus.register(
    Task.Move,
    async () => {
      seen.push("visible");
      return true;
    },
    "promoted",
  );
  offHidden();
  await pending;
  assert.deepEqual(seen, ["visible"]);
  offVisible();
});

test("a handler replaced during handoff still receives the animation once", async () => {
  let release;
  const offHidden = eventbus.register(
    Task.Move,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    "handoff-race",
  );
  const pending = eventbus.call(Task.Move, "handoff-race");
  await new Promise(setImmediate);
  let count = 0;
  const offVisible = eventbus.register(
    Task.Move,
    async () => {
      count++;
      return true;
    },
    "handoff-race",
  );
  offHidden();
  release(false);
  await pending;
  assert.equal(count, 1);
  offVisible();
});
