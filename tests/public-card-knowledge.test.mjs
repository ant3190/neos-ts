import assert from "node:assert/strict";
import test from "node:test";

import { ygopro } from "../src/api/ocgcore/idl/ocgcore.ts";
import {
  clearPublicCardKnowledge,
  getPublicCardCode,
  rememberPublicCard,
} from "../src/service/utils/publicCardKnowledge.ts";

const location = (sequence, controller = 1) =>
  new ygopro.CardLocation({
    controller,
    zone: ygopro.CardZone.EXTRA,
    sequence,
  });

test("public selection identities retain exact owners and non-contiguous positions", () => {
  const context = {};
  rememberPublicCard(context, location(6), 46986414);
  rememberPublicCard(context, location(3), 100000001);
  assert.equal(getPublicCardCode(context, location(6)), 46986414);
  assert.equal(getPublicCardCode(context, location(3)), 100000001);
  assert.equal(getPublicCardCode(context, location(5)), 0);
  assert.equal(getPublicCardCode(context, location(6, 0)), 0);
});

test("disclosed identities do not cross duel contexts or overwrite a public code with zero", () => {
  const first = {},
    second = {};
  rememberPublicCard(first, location(6), 46986414);
  rememberPublicCard(first, location(6), 0);
  assert.equal(getPublicCardCode(first, location(6)), 46986414);
  assert.equal(getPublicCardCode(second, location(6)), 0);
});

test("identity changes clear only the affected context, while a duel reset clears all", () => {
  const first = {},
    second = {};
  rememberPublicCard(first, location(6), 46986414);
  rememberPublicCard(second, location(6), 100000001);
  clearPublicCardKnowledge(first);
  assert.equal(getPublicCardCode(first, location(6)), 0);
  assert.equal(getPublicCardCode(second, location(6)), 100000001);
  clearPublicCardKnowledge();
  assert.equal(getPublicCardCode(second, location(6)), 0);
});
