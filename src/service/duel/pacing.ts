export interface DuelPacing {
  /** Includes the time already spent on the card's animation. */
  minimumMs: number;
  settleMs: number;
}

/** Short reading beats, following YGOPro's event-specific WaitFrameSignal use. */
export function getDuelPacing(
  event: string,
  chainLength = 0,
): DuelPacing | undefined {
  switch (event) {
    case "move":
    case "pos_change":
    case "swap":
      return { minimumMs: 300, settleMs: 80 };
    case "draw":
      return { minimumMs: 380, settleMs: 100 };
    case "summoning":
    case "sp_summoning":
    case "flip_summoning":
      return { minimumMs: 220, settleMs: 0 };
    case "summoned":
    case "sp_summoned":
    case "flip_summoned":
    case "set":
      return { minimumMs: 0, settleMs: 80 };
    case "chaining":
      return { minimumMs: 600, settleMs: 80 };
    case "chained":
      return chainLength > 1 ? { minimumMs: 320, settleMs: 0 } : undefined;
    case "solving":
      return chainLength > 1 ? { minimumMs: 240, settleMs: 0 } : undefined;
    case "negated":
    case "disabled":
      return { minimumMs: 300, settleMs: 0 };
    case "attack":
      return { minimumMs: 400, settleMs: 0 };
    case "battle":
      return { minimumMs: 480, settleMs: 0 };
    case "become_target":
      return { minimumMs: 160, settleMs: 0 };
    case "new_turn":
      return { minimumMs: 380, settleMs: 0 };
    case "new_phase":
      return { minimumMs: 300, settleMs: 0 };
    case "confirm_cards":
      return { minimumMs: 600, settleMs: 80 };
    // State queries, input prompts and chain cleanup have no extra wait.
    default:
      return undefined;
  }
}

export function remainingDuelPace(
  pacing: DuelPacing | undefined,
  elapsedMs: number,
) {
  return pacing
    ? Math.max(pacing.minimumMs - elapsedMs, pacing.settleMs, 0)
    : 0;
}

/** Uses one wall-clock timer, so a slow/paused renderer cannot stall the duel. */
export async function waitForDuelPace(
  pacing: DuelPacing | undefined,
  elapsedMs: number,
  skip = false,
) {
  const visibility = typeof document === "undefined" ? undefined : document;
  const delay = remainingDuelPace(pacing, elapsedMs);
  if (skip || visibility?.hidden || delay <= 0) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      visibility?.removeEventListener("visibilitychange", onVisibility);
      resolve();
    };
    const onVisibility = () => {
      if (visibility?.hidden) finish();
    };
    const timer = setTimeout(finish, delay);
    visibility?.addEventListener("visibilitychange", onVisibility);
  });
}
