import path from "node:path";

import type { Page } from "@playwright/test";
import initSqlJs from "sql.js";

/** Tiny fixture database and art keep interaction regressions independent of CDN availability. */
export async function installOfflineDuelResources(page: Page) {
  const SQL = await initSqlJs({
    locateFile: (file) => path.resolve("node_modules/sql.js/dist", file),
  });
  const db = new SQL.Database();
  db.run(
    "CREATE TABLE datas (id INTEGER PRIMARY KEY, ot INTEGER, alias INTEGER, setcode INTEGER, type INTEGER, atk INTEGER, def INTEGER, level INTEGER, race INTEGER, attribute INTEGER)",
  );
  db.run(
    `CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT, desc TEXT, ${Array.from(
      { length: 16 },
      (_, i) => `str${i + 1} TEXT`,
    ).join(", ")})`,
  );
  db.run(
    "INSERT INTO datas VALUES (46986414, 3, 0, 0, 33, 2500, 2100, 7, 2, 32)",
  );
  db.run(
    "INSERT INTO texts (id, name, desc, str1, str2) VALUES (46986414, '测试卡片', '交互回归测试', '效果一', '效果二')",
  );
  const bytes = Buffer.from(db.export());
  db.close();
  await page.route(/\.cdb(?:\?.*)?$/, (route) =>
    route.fulfill({
      body: bytes,
      contentType: "application/octet-stream",
      headers: {
        "access-control-allow-origin": "*",
        "content-length": `${bytes.length}`,
      },
    }),
  );
  await page.route(/\/strings\.conf$/, (route) =>
    route.fulfill({
      body: "!system 556 选择效果\n!system 203 选择要发动的卡片\n!system 1211 确定\n!system 1295 取消\n!system 1296 完成\n",
      contentType: "text/plain",
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.route(/\/images\/.*\.(?:jpg|png|webp)(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="186"><rect width="128" height="186" fill="#9572b7"/><rect x="12" y="30" width="104" height="90" fill="#29475f"/></svg>',
    }),
  );
}
