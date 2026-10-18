/** Verified from MDPro3 GameCard.cs / DuelMessage.cs, commit e177cd8. */
export const MDPRO3 = {
  move: 400,
  drawOwn: 500,
  drawOpponent: 250,
  position: 200,
  positionSettle: 300,
  activate: { enter: 200, hold: 700, exit: 200 },
  confirm: { enter: 100, hold: 800, exit: 100 },
  negate: 1000,
  land: 1000,
  token: 200,
  target: 500,
  coin: 3000,
  dice: 2000,
  lpFloat: 1100,
  lpRoll: 1200,
  lpMessage: 500,
  statRoll: 600,
} as const;

export function battleTiming(attack: number) {
  return attack >= 2000
    ? { windup: 500, strike: 150, hit: 300, return: 300 }
    : { windup: 300, strike: 100, hit: 300, return: 300 };
}

export function summonTiming(strong: boolean) {
  return strong
    ? { rise: 400, hover: 260, drop: 140 }
    : { rise: 300, hover: 160, drop: 140 };
}

/** MDPro3 YGOSharp/Card.cs: link 3+, rank 4+, or level 7+. */
export function highSummon(level = 0, kind?: string, linkMarkers = 0) {
  let arrows = 0;
  for (let i = 0; i < 9; i++) if (i !== 4 && (linkMarkers >>> i) & 1) arrows++;
  return (
    (kind === "link" && arrows > 2) ||
    (kind === "xyz" && level > 3) ||
    level > 6
  );
}
