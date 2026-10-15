import { useLayoutEffect, useRef } from "react";

const handlers = new Map<
  symbol,
  { priority: number; order: number; run: () => void }
>();
let order = 0;

/** One right click belongs to the topmost active interaction, never two prompts. */
function dispatch(event: MouseEvent) {
  if (
    (event.target as Element)?.closest?.(
      "input, textarea, select, [contenteditable=true]",
    )
  )
    return;
  const handler = [...handlers.values()].sort(
    (a, b) => b.priority - a.priority || b.order - a.order,
  )[0];
  if (!handler) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  handler.run();
}

export function useDuelRightClick(
  active: boolean,
  run: () => void,
  priority = 300,
) {
  const latest = useRef(run);
  latest.current = run;
  useLayoutEffect(() => {
    if (!active) return;
    const id = Symbol("duel-return");
    if (!handlers.size)
      document.addEventListener("contextmenu", dispatch, true);
    handlers.set(id, { priority, order: ++order, run: () => latest.current() });
    return () => {
      handlers.delete(id);
      if (!handlers.size)
        document.removeEventListener("contextmenu", dispatch, true);
    };
  }, [active, priority]);
}
