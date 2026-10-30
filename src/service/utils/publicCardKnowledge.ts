import type { ygopro } from "@/api/ocgcore/idl/ocgcore";
import type { Context } from "@/container";

let known = new WeakMap<Context, Map<string, number>>();

function key(location: ygopro.CardLocation) {
  return `${location.controller}:${location.zone}:${location.sequence}:${
    location.is_overlay ? location.overlay_sequence : ""
  }`;
}

/** Public identities belong to their disclosed positions, never to a hidden wire code. */
export function rememberPublicCard(
  context: Context,
  location: ygopro.CardLocation,
  code: number,
) {
  if (!code) return;
  let cards = known.get(context);
  if (!cards) known.set(context, (cards = new Map()));
  cards.set(key(location), code);
}

export function getPublicCardCode(
  context: Context,
  location: ygopro.CardLocation,
) {
  return known.get(context)?.get(key(location)) ?? 0;
}

export function clearPublicCardKnowledge(context?: Context) {
  if (context) known.delete(context);
  else known = new WeakMap();
}
