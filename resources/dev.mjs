import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) loadEnvFile(fileURLToPath(envFile));
const { startResources } = await import("./server.mjs");
const app = await startResources();
const address = app.server.address();
const host = ["0.0.0.0", "::"].includes(address.address)
  ? "127.0.0.1"
  : address.address;
const resourceUrl = `http://${host.includes(":") ? `[${host}]` : host}:${
  address.port
}`;
const vite = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
    ...process.argv.slice(2),
  ],
  {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    stdio: "inherit",
    env: { ...process.env, NEOS_RESOURCE_URL: resourceUrl },
  },
);
let closing = false;
const close = async (code = 0) => {
  if (closing) return;
  closing = true;
  vite.kill("SIGTERM");
  await app.close();
  process.exit(code);
};
vite.once("exit", (code) => void close(code || 0));
vite.once("error", (error) => {
  console.error("Vite:", error.message);
  void close(1);
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => void close());
