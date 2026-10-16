import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { makeConfig, publicPrefix } from "./config.mjs";
import { ResourceService, StorageSetupError } from "./service.mjs";
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
        if (request.method === "POST") {
          const origin = request.headers.origin;
          if (origin && new URL(origin).host !== request.headers.host) {
            json(response, 403, { error: "Origin mismatch" });
            return;
          }
        }
        if (url.pathname === "/api/resources/setup") {
          if (request.method === "GET") {
            json(
              response,
              200,
              manager.storageStatus?.() || {
                configured: true,
                directory: manager.config.root,
              },
            );
            return;
          }
          if (request.method === "POST" && manager.configure) {
            if (
              !request.headers["content-type"]?.startsWith("application/json")
            )
              throw new StorageSetupError("请以 JSON 提交存储设置。", 415);
            const chunks = [];
            let size = 0;
            if (Number(request.headers["content-length"]) > 8192)
              throw new StorageSetupError("设置内容过长。", 413);
            for await (const chunk of request) {
              size += chunk.length;
              if (size > 8192)
                throw new StorageSetupError("设置内容过长。", 413);
              chunks.push(chunk);
            }
            let settings;
            try {
              settings = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            } catch {
              throw new StorageSetupError("存储设置格式无效。");
            }
            json(response, 200, await manager.configure(settings?.directory));
            return;
          }
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
          void manager
            .check()
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
        if (error instanceof StorageSetupError) {
          json(response, error.status, {
            error: error.message,
            setupRequired: !manager.manager,
          });
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
  const manager = new ResourceService(config);
  await manager.initialize();
  const server = createResourceServer(manager);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  console.info(
    `Local resources listening on ${JSON.stringify(server.address())}`,
  );
  if (!manager.manager)
    console.info("Resource storage awaits first-run setup in the webpage.");
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
