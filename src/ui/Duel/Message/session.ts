/** Every prompt owns its resolver; a reset cannot let an old promise close a new prompt. */
export class PromptSession<T = void> {
  private pending?: { resolve: (value: T) => void; id: number };
  private serial = 0;
  begin(cancelValue: T): { id: number; promise: Promise<T> } {
    this.settle(cancelValue);
    const id = ++this.serial;
    const promise = new Promise<T>((resolve) => {
      this.pending = { resolve, id };
    });
    return { id, promise };
  }
  current(id: number) {
    return this.serial === id;
  }
  settle(value: T) {
    const pending = this.pending;
    this.pending = undefined;
    pending?.resolve(value);
  }
  reset(value: T) {
    this.settle(value);
    this.serial++;
  }
}

let duelEpoch = 0;
const prompts = new Set<string>();
export const getDuelEpoch = () => duelEpoch;
export const hasDuelPrompt = () => prompts.size > 0;
export function setDuelPrompt(key: string, open: boolean) {
  if (open) prompts.add(key);
  else prompts.delete(key);
}
export function resetDuelPromptSession() {
  duelEpoch++;
  prompts.clear();
}
