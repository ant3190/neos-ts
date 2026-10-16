import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { startResources } from "./server.mjs";

const app = await startResources();
const vite = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: process.env },
);
let closing = false;
const close = async (code = 0) => {
  if (closing) return;
  closing = true;
  vite.kill("SIGTERM");
  await app.close();
  process.exit(code);
};
vite.once("exit", (code) => {
  void close(code || 0);
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    void close();
  });
