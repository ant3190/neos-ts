# 本地资源与自动更新

卡片数据库、卡图、先行卡配置、禁限表、提示文本和字体均通过当前站点的 `/local-resources/` 地址提供。音乐、音效、界面素材和 SQL.js WASM 已随前端打包。本地化指部署服务器保存全量资源；浏览器只加载当前使用的内容并进行 HTTP 缓存。

## 部署

在服务器现有仓库目录运行：

```bash
git switch feat/mdpro3-duel-parity
git pull --ff-only origin feat/mdpro3-duel-parity
docker compose up --build -d
```

网页端口仍为 `18080`。Compose 会同时启动 `neos` 前端和 `resources` 资源服务，不需要额外安装数据库或 Node。

首次启动会自动下载完整资源，包括简中、英文、西班牙文、日文、韩文卡库，以及项目实际使用的中英文卡图、先行卡图和两款字体。资源目录建议预留 4 GB，实际大小随卡库更新变化。卡库准备好后网页即可使用，余下卡图继续后台下载；尚未下载到的卡图会优先下载后保存在服务器。

## 更新方式

- 每次完整打开或刷新网页都会向同源的 `/api/resources/check` 发起一次检查；页面内导航复用该次初始化。
- 资源服务使用 `ETag` 和 `Last-Modified` 发起条件请求。未变更时返回 304，不传输文件；上游缺少验证标记时下载后比较 SHA-256，相同内容不重写文件。
- 卡库、配置和禁限表先检查，字体及全量卡图在后台同步。多个页面共用正在执行的任务，单个文件下载也会合并。
- 文件经过格式校验，卡库还会检查 SQLite 表结构及完整性。成功后通过文件重命名替换旧版本；更新失败继续提供已保存的版本。暂时的网络错误会有限重试，主 CDN 无法访问时可切换到同一资源的备用分发域名。
- 同步中断后，下次启动或打开网页会继续检查已有文件并补齐缺失内容。连续网络失败会暂停本轮卡图同步，避免长时间重复请求失效上游。
- 浏览器对本地资源采用缓存后重验证，避免长期使用旧卡图或字体。当前对局不会因为后台卡库更新而强制刷新，已载入的数据在下次打开网页时重新加载。
- 上游不存在的卡图记录为缺失，不影响其他文件同步；短时间内反复显示同一缺失卡图不会重复访问上游。

检查和下载都由服务器完成，浏览器无需直接请求资源 CDN。账号登录、联机对战、云牌组等在线服务仍使用原有接口。

## 持久化和进度

Compose 使用命名卷 `resource-data`，由当前 Compose 项目管理。容器内路径为：

- `resources:/data/files/`：实际资源文件。
- `resources:/data/state.sqlite`：文件哈希、上游验证标记和检查时间。
- `resources:/data/work/`：临时下载文件。

普通的 `docker compose up --build -d`、重启及 `docker compose down` 会保留资源卷。`docker compose down -v` 会删除命名卷，之后需要重新下载。

查看同步进度：

```bash
docker compose logs -f resources
curl http://127.0.0.1:18080/api/resources/status
```

状态包含 `ready`、`phase`、`version`、已保存的文件数和字节数，以及本轮 `total/completed/missing/failed`。`ready` 表示默认语言的必要卡库已准备好，`phase=idle` 表示目前没有同步任务。`missing` 表示上游返回 404 的文件，`failed` 表示本轮未能成功检查的文件。

备份时保存资源卷，可通过容器复制到宿主机：

```bash
docker compose cp resources:/data ./resource-backup
```

为保证 SQLite 状态文件与备份一致，可先 `docker compose stop resources`，复制完成后 `docker compose start resources`。若仅复制了 `files/`，缺少状态数据库，文件仍可由服务读取，后续检查会重新建立验证记录。

## 开发与配置

需要 Node 24：

```bash
npm ci
npm run dev
```

开发命令会同时启动资源服务和 Vite，资源默认保存到被 Git 忽略的 `resource-data/`。仅启动资源服务可运行 `npm run resources:serve`。上游地址及需要镜像的语言在 `resources/upstream.json` 中配置，前端的两份 `neos.config*.json` 使用同源本地路径。

环境变量：

| 变量                        | 默认值                          | 用途                                                            |
| --------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `NEOS_RESOURCE_DIR`         | `resource-data`，容器中 `/data` | 持久化目录                                                      |
| `NEOS_RESOURCE_CONCURRENCY` | `6`                             | 同时下载数量，范围 1–16                                         |
| `NEOS_RESOURCE_PORT`        | `8788`                          | 内部资源服务端口                                                |
| `NEOS_RESOURCE_HOST`        | `0.0.0.0`                       | 监听地址                                                        |
| `NEOS_RESOURCE_AUTO_SYNC`   | 启用                            | 设为 `0` 可关闭服务启动时的同步，网页打开时仍会触发检查         |
| `NEOS_RESOURCE_OFFLINE`     | `0`                             | 设为 `1` 时只使用已有资源，不访问上游；离线浏览器测试使用此模式 |

Compose 中资源服务仅在内部网络提供端口，外部通过 Nginx 访问。Nginx 内部重定向负责发送已经落盘的资源，浏览器无法访问状态数据库和临时目录。下载接口只允许配置中的文件及实际卡库中的卡片编号，不接受任意远端 URL。

## 验证

```bash
npm run test:resources
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e -- tests/e2e/local-resources.spec.ts --workers=1
```

资源服务测试覆盖条件请求、内容变化、无效文件、网络失败、并发请求合并、持久化重启、语言卡库的编号并集、全量同步、缺失卡图、路径限制和本地 HTTP 重验证。浏览器测试覆盖每次打开检查、全部资源同源、初始化失败后重试，以及原有对战回归。
