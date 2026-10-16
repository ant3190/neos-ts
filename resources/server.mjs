import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { makeConfig, publicPrefix } from "./config.mjs";
import { ResourceManager } from "./manager.mjs";
import { NotFound, sendFile } from "./store.mjs";

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

export function createResourceServer(manager) {
  return createServer(
    { requestTimeout: 15_000, headersTimeout: 10_000 },
    async (request, response) => {
      try {
        const url = new URL(request.url, "http://resources.local");
        if (url.pathname === "/health" && request.method === "GET") {
          json(response, 200, { ok: true });
          return;
        }
        if (
          url.pathname === "/api/resources/status" &&
          request.method === "GET"
        ) {
          json(
            response,
            200,
            manager.status(
              url.searchParams.get("language"),
              url.searchParams.get("job"),
            ),
          );
          return;
        }
        if (
          url.pathname === "/api/resources/check" &&
          request.method === "POST"
        ) {
          const origin = request.headers.origin;
          if (origin && new URL(origin).host !== request.headers.host) {
            json(response, 403, { error: "Origin mismatch" });
            return;
          }
          void manager
            .check({
              full: url.searchParams.get("full") === "1",
              retry: url.searchParams.get("retry") === "1",
            })
            .catch((error) => console.error("Resource check:", error.message));
          json(response, 202, manager.status(url.searchParams.get("language")));
          return;
        }
        if (
          ["GET", "HEAD"].includes(request.method) &&
          url.pathname.startsWith(publicPrefix)
        ) {
          const key = decodeURIComponent(
            url.pathname.slice(publicPrefix.length),
          );
          // Reject traversal before looking up the allowlist, including encoded slashes.
          manager.store.file(key);
          await manager.ensure(key);
          sendFile(manager.store, key, request, response);
          return;
        }
        json(response, 404, { error: "Not found" });
      } catch (error) {
        if (response.headersSent) {
          response.destroy();
          return;
        }
        if (!(error instanceof NotFound))
          console.warn("Resource request:", error.message);
        json(response, error instanceof NotFound ? 404 : 503, {
          error:
            error instanceof NotFound
              ? "资源不存在"
              : "资源暂时不可用，请稍后重试",
        });
      }
    },
  );
}

export async function startResources(config = makeConfig()) {
  const manager = new ResourceManager(config),
    server = createResourceServer(manager);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  console.info(
    `Local resources listening on ${JSON.stringify(server.address())}`,
  );
  console.info(`Resource data directory: ${config.root}`);
  if (config.autoSync)
    void manager.check().catch((error) => console.error(error.message));
  const close = async () => {
    server.close();
    server.closeIdleConnections();
    await manager.close();
    server.closeAllConnections();
  };
  return { server, manager, close };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const app = await startResources();
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      void app.close().finally(() => process.exit(0));
    });
}
