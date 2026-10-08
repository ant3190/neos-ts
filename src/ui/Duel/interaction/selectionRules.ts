interface LevelOption {
  level1?: number;
  level2?: number;
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
) {
  if (single) return chosen.length === 1;
  return (
    chosen.length >= min &&
    chosen.length <= max &&
    levelsMatch([...mandatory, ...chosen], target, overflow)
  );
}
