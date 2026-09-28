import type { MoveFunc } from "./types";
import { asyncStart } from "./utils";

export const moveToToken: MoveFunc = async (props) => {
  const { api, options } = props;
  if (options?.instant) {
    api.set({ scale: 0, opacity: 1 });
    return;
  }
  await asyncStart(api)({
    scale: 0,
    opacity: 0,
  });
  api.set({ opacity: 1 });
};
