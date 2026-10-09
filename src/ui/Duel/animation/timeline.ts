/** Wall-clock lifetimes: cosmetic effects must never hold the engine message queue. */
export class EffectTimeline<T extends { duration: number }> {
  private serial = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private cueTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private listeners = new Set<() => void>();
  private waiting: T[] = [];
  private revealTimer?: ReturnType<typeof setTimeout>;
  private state: { cues: (T & { id: number })[]; reveal?: T & { id: number } } =
    { cues: [] };

  constructor(
    private maxCues = 10,
    private maxReveals = 8,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish() {
    this.listeners.forEach((listener) => listener());
  }
  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
    return timer;
  }
  emit(cue: T) {
    const item = { ...cue, id: ++this.serial };
    this.state = {
      ...this.state,
      cues: [...this.state.cues, item].slice(-this.maxCues),
    };
    this.publish();
    for (const [id, timer] of this.cueTimers)
      if (!this.state.cues.some((cue) => cue.id === id)) {
        clearTimeout(timer);
        this.timers.delete(timer);
        this.cueTimers.delete(id);
      }
    const timer = this.later(() => {
      this.cueTimers.delete(item.id);
      this.state = {
        ...this.state,
        cues: this.state.cues.filter((entry) => entry.id !== item.id),
      };
      this.publish();
    }, cue.duration);
    this.cueTimers.set(item.id, timer);
  }
  reveal(cue: T) {
    if (this.state.reveal) {
      this.waiting = [...this.waiting, cue].slice(-this.maxReveals);
      return;
    }
    this.state = { ...this.state, reveal: { ...cue, id: ++this.serial } };
    this.publish();
    this.revealTimer = this.later(() => this.advanceReveal(), cue.duration);
  }
  /** Engine-controlled state replaces cosmetic backlog and ends only on a message. */
  showLive(cue: T) {
    if (this.revealTimer !== undefined) {
      clearTimeout(this.revealTimer);
      this.timers.delete(this.revealTimer);
      this.revealTimer = undefined;
    }
    this.waiting = [];
    this.state = { ...this.state, reveal: { ...cue, id: ++this.serial } };
    this.publish();
  }
  private advanceReveal() {
    this.revealTimer = undefined;
    this.state = { ...this.state, reveal: undefined };
    const next = this.waiting.shift();
    if (next)
      this.reveal({
        ...next,
        duration: this.waiting.length
          ? Math.min(next.duration, 650)
          : next.duration,
      });
    else this.publish();
  }
  /** A completed or negated link must not later replay an obsolete display. */
  discardReveals(predicate: (cue: T) => boolean) {
    this.waiting = this.waiting.filter((cue) => !predicate(cue));
    if (!this.state.reveal || !predicate(this.state.reveal)) return;
    if (this.revealTimer !== undefined) {
      clearTimeout(this.revealTimer);
      this.timers.delete(this.revealTimer);
    }
    this.advanceReveal();
  }
  /** CHAINED enriches the activation already showing, without adding another wait. */
  reviseReveal(
    predicate: (cue: T) => boolean,
    update: Partial<T>,
    remainingMs?: number,
  ): boolean {
    if (this.state.reveal && predicate(this.state.reveal)) {
      this.state = {
        ...this.state,
        reveal: { ...this.state.reveal, ...update },
      };
      if (remainingMs !== undefined) {
        if (this.revealTimer !== undefined) {
          clearTimeout(this.revealTimer);
          this.timers.delete(this.revealTimer);
        }
        this.revealTimer = this.later(() => this.advanceReveal(), remainingMs);
      }
      this.publish();
      return true;
    }
    const index = this.waiting.findIndex(predicate);
    if (index < 0) return false;
    this.waiting[index] = { ...this.waiting[index], ...update };
    if (remainingMs !== undefined) this.waiting[index].duration = remainingMs;
    return true;
  }
  clear() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.cueTimers.clear();
    this.waiting = [];
    this.revealTimer = undefined;
    this.state = { cues: [] };
    this.publish();
  }
}
