import { getCardImgUrl } from "@/api/cards";

const MAX_WARM_IMAGES = 32;
const MAX_BACKGROUND_REQUESTS = 2;

interface LoadingImage {
  image: HTMLImageElement;
  priority: "low" | "high";
  cancel: () => void;
}

const ready = new Map<string, HTMLImageElement>();
const fetched = new Set<string>();
const loading = new Map<string, LoadingImage>();
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
    if (priority === "high") {
      existing.priority = "high";
      existing.image.setAttribute("fetchpriority", "high");
    }
    return;
  }
  const image = new Image();
  image.setAttribute("fetchpriority", priority);
  let finished = false;
  const finish = (success: boolean, continueQueue = true) => {
    if (finished) return;
    finished = true;
    if (success) remember(url, image);
    loading.delete(url);
    if (continueQueue) drain();
  };
  loading.set(url, {
    image,
    priority,
    cancel: () => {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
      finish(false, false);
    },
  });
  image.onload = () => {
    // Some browsers reject decode() even after a valid image has loaded.
    (typeof image.decode === "function"
      ? image.decode()
      : Promise.resolve()
    ).then(
      () => finish(image.naturalWidth > 0),
      () => {
        if (image.complete && image.naturalWidth > 0) fetched.add(url);
        finish(false);
      },
    );
  };
  image.onerror = () => finish(false);
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
  pending = [];
  for (const [url, task] of loading) {
    if (selected.has(url) || task.priority === "high") continue;
    task.cancel();
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
  if (
    !ready.has(url) &&
    !loading.has(url) &&
    loading.size >= MAX_BACKGROUND_REQUESTS
  ) {
    // Free a connection occupied by deck warming for the card being revealed.
    const background = [...loading].find(([, task]) => task.priority === "low");
    if (background) {
      background[1].cancel();
      pending = [
        background[0],
        ...pending.filter((item) => item !== background[0]),
      ];
    }
  }
  load(url, "high");
}
