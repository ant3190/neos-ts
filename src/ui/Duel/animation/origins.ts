import type { ygopro } from "@/api";

/** A card promoted from a hidden deck slot starts at its source rather than teleporting. */
const origins = new Map<string, ygopro.CardLocation>();
export function rememberCardOrigin(
  uuid: string,
  location: ygopro.CardLocation,
) {
  origins.set(uuid, location);
}
export function consumeCardOrigin(uuid: string) {
  const location = origins.get(uuid);
  origins.delete(uuid);
  return location;
}
export function resetCardOrigins() {
  origins.clear();
}
