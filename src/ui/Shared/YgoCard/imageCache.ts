import { getCardImgUrl } from "@/api/cards";

const MAX_WARM_IMAGES = 32;
const MAX_BACKGROUND_REQUESTS = 4;

const ready = new Map<string, HTMLImageElement>();
const fetched = new Set<string>();
const loading = new Map<string, HTMLImageElement>();
let pending: string[] = [];
let generation = 0;

function remember(url: string, image: HTMLImageElement) {
  fetched.add(url);
  ready.delete(url);
  ready.set(url, image);
  if (ready.size > MAX_WARM_IMAGES) ready.delete(ready.keys().next().value!);
}

function load(url: string, priority: "low" | "high") {
  if (typeof Image === "undefined" || ready.has(url)) return;
  const existing = loading.get(url);
  if (existing) {
    if (priority === "high") existing.setAttribute("fetchpriority", "high");
    return;
  }
  const image = new Image();
  image.setAttribute("fetchpriority", priority);
  loading.set(url, image);
  image.onload = () => {
    // decode() warms the pixels as well as the browser's HTTP image cache.
    (typeof image.decode === "function" ? image.decode() : Promise.resolve())
      .then(
        () => remember(url, image),
        () => {},
      )
      .finally(() => {
        loading.delete(url);
        drain();
      });
  };
  image.onerror = () => {
    loading.delete(url);
    drain();
  };
  image.src = url;
}

function drain() {
  while (pending.length && loading.size < MAX_BACKGROUND_REQUESTS) {
    const url = pending.shift()!;
    load(url, "low");
  }
}

/** Background image requests begin when a deck is selected, before the duel. */
export function warmDeckImages(codes: readonly number[]): () => void {
  if (typeof Image === "undefined") return () => {};
  const current = ++generation;
  const urls = [
    ...new Set(
      codes.filter((code) => code > 0).map((code) => getCardImgUrl(code)),
    ),
  ];
  const selected = new Set(urls);
  for (const [url, image] of loading) {
    if (selected.has(url) || image.getAttribute("fetchpriority") === "high")
      continue;
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    loading.delete(url);
  }
  pending = urls.filter((url) => !fetched.has(url));
  drain();
  return () => {
    if (generation === current) pending = [];
  };
}

/** A newly disclosed card takes priority over background deck requests. */
export function requestCardImage(code: number): void {
  if (code <= 0 || typeof Image === "undefined") return;
  const url = getCardImgUrl(code);
  pending = pending.filter((candidate) => candidate !== url);
  load(url, "high");
}

export function isCardImageReady(url: string): boolean {
  const image = ready.get(url);
  if (image) remember(url, image);
  return fetched.has(url);
}
