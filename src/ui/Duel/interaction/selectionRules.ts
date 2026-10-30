interface LevelOption {
  level1?: number;
  level2?: number;
}

/** Stable across changing per-request response indices. */
export function selectionKey(option: {
  location?: {
    controller: number;
    zone: number;
    sequence: number;
    is_overlay?: boolean;
    overlay_sequence?: number;
  };
  meta?: { id: number };
}) {
  const p = option.location;
  return p
    ? `${p.controller}:${p.zone}:${p.sequence}:${
        p.is_overlay ? p.overlay_sequence : ""
      }`
    : `code:${option.meta?.id ?? 0}`;
}

/** Each material may have two legal levels; mixed choices must also be accepted. */
export function levelsMatch(
  options: readonly LevelOption[],
  target: number,
  overflow: boolean,
) {
  if (target === 0) return true;
  let sums = new Set([0]);
  for (const option of options) {
    const choices = [
      ...new Set([option.level1 ?? 0, option.level2 || option.level1 || 0]),
    ];
    const next = new Set<number>();
    for (const sum of sums)
      for (const choice of choices) {
        const value = sum + choice;
        if (overflow) next.add(Math.min(value, target));
        else if (value <= target) next.add(value);
      }
    sums = next;
  }
  return sums.has(target);
}

export function selectionValid(
  chosen: readonly LevelOption[],
  mandatory: readonly LevelOption[],
  min: number,
  max: number,
  single: boolean,
  target: number,
  overflow: boolean,
  tribute = false,
) {
  if (single) return chosen.length === 1;
  if (tribute)
    return (
      chosen.length <= max &&
      chosen.reduce((sum, c) => sum + (c.level1 || 1), 0) >= min
    );
  return (
    chosen.length >= min &&
    chosen.length <= max &&
    levelsMatch([...mandatory, ...chosen], target, overflow)
  );
}

/** An exact sum candidate is selectable only if some completion still exists. */
export function selectionCanComplete(
  chosen: readonly LevelOption[],
  remaining: readonly LevelOption[],
  mandatory: readonly LevelOption[],
  min: number,
  max: number,
  target: number,
  overflow: boolean,
) {
  if (!target || overflow) return true;
  if (chosen.length > max) return false;
  let initial = new Set([0]);
  const choices = (c: LevelOption) => [
    ...new Set([c.level1 ?? 0, c.level2 || c.level1 || 0]),
  ];
  for (const c of [...mandatory, ...chosen]) {
    const next = new Set<number>();
    for (const sum of initial)
      for (const v of choices(c)) if (sum + v <= target) next.add(sum + v);
    initial = next;
  }
  const limit = Math.min(max, chosen.length + remaining.length);
  const dp = Array.from({ length: limit + 1 }, () => new Set<number>());
  dp[chosen.length] = initial;
  for (const c of remaining)
    for (let n = limit; n > chosen.length; n--)
      for (const sum of dp[n - 1])
        for (const v of choices(c)) if (sum + v <= target) dp[n].add(sum + v);
  return dp.some((s, n) => n >= min && s.has(target));
}
