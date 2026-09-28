import assert from "node:assert/strict";
import { test } from "node:test";

import { createLocalId } from "../src/infra/localId.ts";

test("duel IDs remain unique if browser random generation throws", () => {
  const previousCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues() {
        throw new DOMException("The operation failed for an operation-specific reason");
      },
    },
  });
  try {
    const ids = Array.from({ length: 500 }, () => createLocalId());
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    if (previousCrypto) Object.defineProperty(globalThis, "crypto", previousCrypto);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});
