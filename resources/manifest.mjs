export const manifestKey = "metadata/upstream-manifest.json";

/** Hashes describe configured resources; the index cannot introduce download URLs. */
export function parseManifest(text) {
  const document = JSON.parse(text);
  if (
    document?.schema !== 1 ||
    !document.files ||
    typeof document.files !== "object" ||
    Array.isArray(document.files)
  )
    throw new Error("Invalid resource manifest");
  const entries = Object.entries(document.files);
  if (entries.length > 200_000)
    throw new Error("Resource manifest is too large");
  for (const [key, hash] of entries) {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(key) ||
      key.split("/").some((part) => !part || part === "." || part === "..") ||
      typeof hash !== "string" ||
      !/^[a-fA-F0-9]{64}$/.test(hash)
    )
      throw new Error("Invalid resource manifest entry");
  }
  return new Map(entries.map(([key, hash]) => [key, hash.toLowerCase()]));
}
