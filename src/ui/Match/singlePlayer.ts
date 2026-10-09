/** SRVPro: no banlist, no deck checks, no turn timer; shuffle stays enabled. */
export function createSinglePlayerRoomPassword() {
  // JOIN_GAME holds 20 UTF-16 code units, including its null terminator.
  const roomId = Math.random().toString(36).slice(2, 11).padEnd(9, "0");
  return `NF,NC,TI0#${roomId}`;
}
