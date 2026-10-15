import { useEffect, useRef } from "react";

/** Let a normal mouse wheel browse the same card row as a trackpad. */
export function useHorizontalWheel() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const scroll = (event: WheelEvent) => {
      if (
        event.ctrlKey ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
        element.scrollWidth <= element.clientWidth
      )
        return;
      const unit =
        event.deltaMode === 1
          ? 24
          : event.deltaMode === 2
          ? element.clientWidth
          : 1;
      const scale =
        element.getBoundingClientRect().width / element.offsetWidth || 1;
      element.scrollLeft += (event.deltaY * unit) / scale;
      event.preventDefault();
    };
    element.addEventListener("wheel", scroll, { passive: false });
    return () => element.removeEventListener("wheel", scroll);
  }, []);
  return ref;
}
