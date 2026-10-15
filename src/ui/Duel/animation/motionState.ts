import { proxy } from "valtio";

export const cardMotionState = proxy({
  moving: {} as Record<string, boolean>,
  revealed: {} as Record<string, { code: number; token: number }>,
});
let revealSerial = 0;
/** Public engine events may reveal a face without changing the private wire code. */
export function revealPublicCardFace(uuid: string, code?: number) {
  if (!code) return () => {};
  const token = ++revealSerial;
  cardMotionState.revealed[uuid] = { code, token };
  return () => {
    if (cardMotionState.revealed[uuid]?.token === token)
      delete cardMotionState.revealed[uuid];
  };
}
