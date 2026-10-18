import type { CardType } from "./cardStore";

/** Visual order is independent of the engine's shuffled hand slots. */
export function orderedHand(cards: readonly CardType[]) {
  return [...cards].sort(
    (a, b) =>
      (a.handOrder ?? a.location.sequence) -
      (b.handOrder ?? b.location.sequence),
  );
}

export function nextHandOrder(cards: readonly CardType[]) {
  return (
    Math.max(
      -1,
      ...cards.map((card) => card.handOrder ?? card.location.sequence),
    ) + 1
  );
}

/** Match each physical card once, including duplicates and concealed identities. */
export function remapHand(
  cards: readonly CardType[],
  codes: readonly number[],
) {
  if (cards.length !== codes.length) return [...cards];
  const ordered = orderedHand(cards);
  const matches = new Map<number, CardType[]>();
  for (const card of ordered) {
    card.handOrder ??= card.location.sequence;
    const bucket = matches.get(card.code) ?? [];
    bucket.push(card);
    matches.set(card.code, bucket);
  }
  const slots = codes.map((code) => matches.get(code)?.shift());
  const matched = new Set(slots);
  const remaining = ordered.filter((card) => !matched.has(card));
  return slots.map((card, sequence) => {
    const target = card ?? remaining.shift()!;
    target.location.sequence = sequence;
    return target;
  });
}
