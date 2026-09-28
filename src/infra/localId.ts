// Card and event IDs are only used inside this browser tab. A shared counter
// keeps them unique without depending on Web Crypto being available or working.
let nextId = 0;

export function createLocalId(): string {
  return `neos-${++nextId}`;
}
