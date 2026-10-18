import assert from "node:assert/strict";
import test from "node:test";

import {
  nextHandOrder,
  orderedHand,
  remapHand,
} from "../src/stores/handOrder.ts";

const hand = (codes) =>
  codes.map((code, sequence) => ({
    uuid: `card-${sequence}`,
    code,
    location: { sequence },
  }));

test("repeated server shuffles keep distinct cards and duplicate copies in visual order", () => {
  const cards = hand([1, 2, 1, 3, 4]);
  const original = orderedHand(cards).map((card) => card.uuid);
  for (const codes of [
    [4, 1, 2, 3, 1],
    [1, 4, 1, 2, 3],
    [3, 2, 1, 1, 4],
  ]) {
    const slots = remapHand(cards, codes);
    assert.deepEqual(
      slots.map((card) => card.code),
      codes,
    );
    assert.deepEqual(
      slots.map((card) => card.location.sequence),
      [0, 1, 2, 3, 4],
    );
    assert.equal(new Set(slots).size, cards.length);
    assert.deepEqual(
      orderedHand(cards).map((card) => card.uuid),
      original,
    );
  }
});

test("newly revealed identities cannot consume slots needed by already known cards", () => {
  const cards = hand([1, 0, 2, 0]);
  const slots = remapHand(cards, [3, 1, 0, 2]);
  assert.deepEqual(
    slots.map((card) => card.uuid),
    ["card-3", "card-0", "card-1", "card-2"],
  );
  assert.equal(nextHandOrder(cards), 4);
  assert.equal(
    nextHandOrder(cards.filter((card) => card.uuid !== "card-3")),
    3,
  );
});

test("an incomplete shuffle cannot rewrite known protocol slots", () => {
  const cards = hand([1, 2, 3]);
  assert.deepEqual(remapHand(cards, [2, 1]), cards);
  assert.deepEqual(
    cards.map((card) => card.location.sequence),
    [0, 1, 2],
  );
});
