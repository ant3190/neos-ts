import assert from "node:assert/strict";
import { test } from "node:test";

import { EffectTimeline } from "../src/ui/Duel/animation/timeline.ts";
import { PromptSession } from "../src/ui/Duel/Message/session.ts";
import {
  levelsMatch,
  selectionValid,
} from "../src/ui/Duel/interaction/selectionRules.ts";
import {
  ACTION_ORDER,
  interactionAvailable,
} from "../src/ui/Duel/interaction/actionRules.ts";
import { InteractType } from "../src/stores/matStore/types.ts";
import {
  readPresentationMessage,
  attachPresentationMessage,
  getPresentationMessage,
} from "../src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/presentation.ts";
import { ygopro } from "../src/api/ocgcore/idl/ocgcore.ts";

test("effects expire and advance in a browser with no animation frames", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const timeline = new EffectTimeline();
  timeline.emit({ kind: "summon", duration: 300 });
  timeline.reveal({ kind: "activate", code: 1, duration: 1000 });
  timeline.reveal({ kind: "resolve", code: 1, duration: 700 });
  t.mock.timers.tick(300);
  assert.equal(timeline.getSnapshot().cues.length, 0);
  assert.equal(timeline.getSnapshot().reveal.kind, "activate");
  t.mock.timers.tick(700);
  assert.equal(timeline.getSnapshot().reveal.kind, "resolve");
  t.mock.timers.tick(700);
  assert.equal(timeline.getSnapshot().reveal, undefined);
});

test("bursts stay bounded and a new duel cancels the entire old timeline", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const timeline = new EffectTimeline(3, 2);
  for (let code = 0; code < 100; code++) {
    timeline.emit({ code, duration: 1000 });
    timeline.reveal({ code, duration: 1000 });
  }
  assert.deepEqual(
    timeline.getSnapshot().cues.map((cue) => cue.code),
    [97, 98, 99],
  );
  t.mock.timers.tick(1000);
  assert.equal(timeline.getSnapshot().reveal.code, 98);
  timeline.clear();
  timeline.reveal({ code: 200, duration: 500 });
  t.mock.timers.tick(400);
  assert.equal(timeline.getSnapshot().reveal.code, 200);
  t.mock.timers.tick(10000);
  assert.deepEqual(timeline.getSnapshot(), { cues: [], reveal: undefined });
});

test("live resolution replaces activation backlog and stays until the engine completes it", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const timeline = new EffectTimeline();
  timeline.reveal({ kind: "activate", index: 2, code: 20, duration: 1000 });
  assert.equal(
    timeline.reviseReveal((cue) => cue.index === 2, {
      kind: "chain",
      previousCode: 10,
    }),
    true,
  );
  timeline.reveal({ kind: "activate", index: 3, duration: 1000 });
  assert.equal(timeline.getSnapshot().reveal.previousCode, 10);
  timeline.showLive({ kind: "resolve", index: 3, duration: 150 });
  assert.equal(timeline.getSnapshot().reveal.kind, "resolve");
  assert.equal(timeline.getSnapshot().reveal.index, 3);
  t.mock.timers.tick(5000);
  assert.equal(timeline.getSnapshot().reveal.index, 3);
  timeline.discardReveals((cue) => cue.index === 3);
  assert.equal(timeline.getSnapshot().reveal, undefined);
  t.mock.timers.tick(5000);
  assert.equal(timeline.getSnapshot().reveal, undefined);
  timeline.clear();
});

test("rapid links and reset cannot replay a retired timer or remove a new live resolution", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const timeline = new EffectTimeline();
  timeline.reveal({ kind: "activate", index: 1, duration: 1000 });
  t.mock.timers.tick(300);
  timeline.emit({ kind: "negate", duration: 1000 });
  timeline.showLive({ kind: "resolve", index: 3, duration: 150 });
  timeline.showLive({ kind: "resolve", index: 2, duration: 150 });
  timeline.discardReveals((cue) => cue.index === 3);
  assert.equal(timeline.getSnapshot().reveal.index, 2);
  assert.equal(timeline.getSnapshot().cues[0].kind, "negate");
  t.mock.timers.tick(700);
  assert.equal(timeline.getSnapshot().reveal.index, 2);
  timeline.clear();
  timeline.showLive({ kind: "resolve", index: 1, duration: 150 });
  t.mock.timers.tick(10000);
  assert.equal(timeline.getSnapshot().reveal.index, 1);
  assert.equal(timeline.getSnapshot().cues.length, 0);
  timeline.discardReveals(() => true);
  assert.equal(timeline.getSnapshot().reveal, undefined);
});

test("resetting a prompt cannot let its promise close a replacement prompt", async () => {
  const prompts = new PromptSession();
  const old = prompts.begin(undefined);
  prompts.reset(undefined);
  const current = prompts.begin(undefined);
  await old.promise;
  assert.equal(prompts.current(old.id), false);
  assert.equal(prompts.current(current.id), true);
  prompts.settle(42);
  assert.equal(await current.promise, 42);
});

test("negation cancels current and queued resolution without an old timer skipping the next link", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const timeline = new EffectTimeline();
  timeline.reveal({ kind: "resolve", index: 2, duration: 1000 });
  timeline.reveal({ kind: "resolve", index: 2, duration: 600 });
  timeline.reveal({ kind: "resolve", index: 1, duration: 800 });
  t.mock.timers.tick(300);
  timeline.discardReveals((cue) => cue.kind === "resolve" && cue.index === 2);
  assert.equal(timeline.getSnapshot().reveal.index, 1);
  t.mock.timers.tick(700);
  assert.equal(timeline.getSnapshot().reveal.index, 1);
  t.mock.timers.tick(100);
  assert.equal(timeline.getSnapshot().reveal, undefined);
  timeline.clear();
});

test("material levels accept mixed alternatives and reject invalid counts", () => {
  assert.equal(
    levelsMatch(
      [
        { level1: 1, level2: 4 },
        { level1: 2, level2: 6 },
      ],
      6,
      false,
    ),
    true,
  );
  assert.equal(
    levelsMatch(
      [
        { level1: 1, level2: 4 },
        { level1: 2, level2: 6 },
      ],
      5,
      false,
    ),
    false,
  );
  assert.equal(levelsMatch([{ level1: 4 }, { level1: 6 }], 9, true), true);
  assert.equal(
    selectionValid([{ level1: 4 }], [{ level1: 2 }], 1, 1, false, 6, false),
    true,
  );
  assert.equal(selectionValid([{}, {}], [], 1, 1, false, 0, false), false);
  assert.equal(selectionValid([], [], 1, 1, true, 0, false), false);
});

test("MDPro3 action order and command identities keep idle and battle separate", () => {
  assert.deepEqual(ACTION_ORDER, [
    InteractType.ACTIVATE,
    InteractType.ATTACK,
    InteractType.POS_CHANGE,
    InteractType.SP_SUMMON,
    InteractType.SUMMON,
    InteractType.SSET,
    InteractType.MSET,
  ]);
  const selected = {
    interactType: InteractType.ACTIVATE,
    activateIndex: 80,
    response: 7,
    responseSource: "battle",
  };
  assert.equal(interactionAvailable([{ ...selected }], selected), true);
  assert.equal(
    interactionAvailable([{ ...selected, responseSource: "idle" }], selected),
    false,
  );
  assert.equal(
    interactionAvailable([{ ...selected, activateIndex: 81 }], selected),
    false,
  );
  assert.equal(interactionAvailable([], selected), false);
});

test("chain and damage notifications preserve engine timing and invalid payloads are ignored", () => {
  assert.deepEqual(readPresentationMessage(71, Uint8Array.of(3)), {
    kind: "chained",
    index: 3,
  });
  assert.deepEqual(readPresentationMessage(72, Uint8Array.of(3)), {
    kind: "solving",
    index: 3,
  });
  assert.deepEqual(readPresentationMessage(75, Uint8Array.of(3)), {
    kind: "negated",
    index: 3,
  });
  assert.deepEqual(readPresentationMessage(76, Uint8Array.of(3)), {
    kind: "disabled",
    index: 3,
  });
  assert.equal(readPresentationMessage(72, new Uint8Array()), undefined);
  assert.equal(readPresentationMessage(74, new Uint8Array()), undefined);
  assert.equal(readPresentationMessage(74, Uint8Array.of(3)), undefined);
  assert.equal(readPresentationMessage(75, new Uint8Array()), undefined);
  assert.equal(readPresentationMessage(76, new Uint8Array()), undefined);
  assert.equal(readPresentationMessage(111, new Uint8Array(25)), undefined);
  assert.equal(readPresentationMessage(199, new Uint8Array()), undefined);
  const message = {};
  attachPresentationMessage(message, { kind: "damage-end" });
  assert.equal(getPresentationMessage(message).kind, "damage-end");
  assert.equal(getPresentationMessage({}), undefined);
});

test("battle stats and locations decode signed little endian values and subarray offsets", () => {
  const buffer = new Uint8Array(40);
  const bytes = buffer.subarray(5, 31);
  bytes.set([0, 4, 2, 1]);
  bytes.set([1, 4, 6, 4], 13);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setInt32(4, 3000, true);
  view.setInt32(8, -1, true);
  view.setInt32(17, 2500, true);
  view.setInt32(21, 2000, true);
  const result = readPresentationMessage(111, bytes);
  assert.equal(result.kind, "battle");
  assert.equal(result.attacker.zone, ygopro.CardZone.MZONE);
  assert.equal(result.attacker.sequence, 2);
  assert.equal(result.target.sequence, 6);
  assert.equal(result.attackerDefense, -1);
  assert.equal(result.targetAttack, 2500);
  bytes[14] = 0;
  assert.equal(
    readPresentationMessage(111, bytes).target.zone,
    ygopro.CardZone.EMPTY,
  );
});
