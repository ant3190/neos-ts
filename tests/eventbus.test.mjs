import assert from "node:assert/strict";
import { test } from "node:test";

import { eventbus, Task } from "../src/infra/eventbus.ts";

test("an animation requested before its card mounts runs once after registration", async () => {
  const pending = eventbus.call(Task.Move, "card-before-mount", { fromZone: 1 });
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
  const offA = eventbus.register(Task.Move, async () => {
    seen.push("a");
    return true;
  }, "card-a");
  const offB = eventbus.register(Task.Move, async () => {
    seen.push("b");
    return true;
  }, "card-b");
  await eventbus.call(Task.Move, "card-b");
  assert.deepEqual(seen, ["b"]);
  offA();
  offB();
  const pending = eventbus.call(Task.Move, "card-b");
  const offAgain = eventbus.register(Task.Move, async () => {
    seen.push("b again");
    return true;
  }, "card-b");
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
