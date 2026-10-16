# 一个项目，数据单独存放

前端、资源接口和同步程序都在 **neos-ts** 本仓库中，统一构建和启动。卡片数据库（含效果文本）、卡图、禁限表、先行卡配置、提示文本和字体等下载数据放在仓库外，不进入 Git，也不打包进镜像。

## 部署

直接在 neos-ts 目录运行，无需先创建或编辑 `.env`：

```bash
git switch feat/mdpro3-duel-parity
git pull --ff-only origin feat/mdpro3-duel-parity
docker compose up --build -d --remove-orphans
```

同一个 Compose 项目会启动前端和资源服务。网页仍为 `http://服务器IP:18080`，资源服务仅在内部网络提供接口，不需要单独克隆、启动或更新 neos-resources 项目，也不需要预先创建外部 Docker 网络。

## 首次打开网页设置

1. 打开网页，弹出“首次设置 · 数据存储”。服务在确认前保持待配置状态，不会下载卡库、卡图或字体。
2. 填写数据存储目录，点击“保存并开始下载”。Docker 下可填 `/data` 或其子目录，例如 `/data/cards`；Node 直接运行时填写运行 Neos 的设备上的绝对路径，例如 `/mnt/data/neos-data`。
3. 服务验证目录和写入权限，保存设置后接续资源同步与进度弹窗。目录不可用时会在原窗口提示，可修改后重试，不丢失填写内容。

数据保存在**部署 Neos 的设备**上，访问该服务的所有页面共用，并非每个访问者的电脑。设置持久化保存，刷新页面或重启、重建容器不需要重填。系统设置的“资源存储”页可查看当前目录。

确认后优先下载必要卡库，再在后台同步全量卡图。数据目录建议预留 4 GB；浏览器只加载实际使用的资源。

## 数据放在哪里

Docker 默认将仓库同级的 `../neos-data` 挂载为资源容器中的 `/data`。例如代码在 `/srv/neos-ts`，首次设置选择 `/data/cards`，实际数据就在宿主机 `/srv/neos-data/cards`。仅启动服务会创建挂载点，确认网页设置后才创建卡库和同步元数据。

首次设置单独保存在宿主机 `../neos-config/storage.json`（容器内 `/config/storage.json`），不进入 Git 或镜像。Node 直接运行也默认使用仓库同级的 `../neos-config` 保存设置。

| 宿主机数据目录内容 | 用途                                         |
| ------------------ | -------------------------------------------- |
| `files/`           | 卡库、效果文本、卡图、禁限等实际资源         |
| `state.sqlite`     | 上游校验标记、文件哈希、检查时间等同步元数据 |
| `work/`            | 临时下载文件                                 |

### Docker 使用其他磁盘（可选）

网页只能访问已经挂载进容器的目录，无法直接访问宿主机的未挂载磁盘。默认部署不需要 `.env`；如需换一块宿主机磁盘，可选设置挂载根目录后重建容器：

```dotenv
NEOS_RESOURCE_DATA_DIR=/mnt/data/neos-data
```

容器内仍使用 `/data`，首次网页设置仍然在 `/data` 下选择实际数据目录。该可选变量只控制 Docker 的宿主机挂载，不会绕过网页确认。已有数据时，先停止资源服务并完整复制旧挂载目录内容，再更换挂载；保留 `neos-config` 后，容器内相同路径会继续复用数据。

重建镜像、重启、`docker compose down` 甚至 `down -v` 都不会删除这两个宿主机目录。备份时先运行 `docker compose stop resources`，完整复制数据目录和 `neos-config` 配置目录，再运行 `docker compose start resources`。

## 从之前的独立资源项目迁回

如果已经使用 neos-resources 项目下载过数据，先在旧项目目录停止服务并复制数据，旧数据会保留：

```bash
docker compose stop resources
mkdir -p /srv/neos-data
docker compose cp resources:/data/. /srv/neos-data/
```

如果代码位于 `/srv/neos-ts`，上述数据目录正好是默认挂载位置。其他位置可按上文调整挂载。按单项目命令启动后，在首次网页设置中选择 `/data`，新服务就会复用其中的 `files/` 和 `state.sqlite`，无需重新下载相同内容。保持旧资源服务停止，避免两套服务同时操作同一份数据。后续只更新和部署 neos-ts。

若更早使用的是 neos-ts 内置命名卷，同样先停止旧资源容器并复制 `/data` 的完整内容，再切换配置。若此前已用 `.env` 指定 Docker 数据盘，原挂载路径会继续兼容；首次网页设置中选择 `/data` 即可确认复用。Node 直接运行时在网页填写原数据目录；原数据还在仓库内时先停止服务并将整个目录移到仓库外。

## 自动更新和进度弹窗

- 每次完整打开或刷新网页，检查一次资源更新。确认有变更或缺少资源时弹窗；没有变更时保持静默。
- 显示当前阶段、已处理项数、已更新项数、实际下载量和当前文件的下载进度。处理项数包含无需重新下载的文件，百分比表示当前阶段的处理进度。
- 点击“后台更新”收起弹窗，左下角可重新查看；关闭网页不会取消服务器上的下载。
- 更新任务由多个页面共享；按任务编号读取进度，其他页面的检查不会覆盖当前窗口正在查看的任务。
- 使用 ETag、Last-Modified 和 SHA-256 检查变化；验证文件格式与 SQLite 完整性后原子替换，失败时保留旧版本。验证标记变了但内容相同不会误报更新。
- 下载失败可以重试，连接中断会自动重连。完成后由用户点击“刷新加载新数据”，不会自动刷新或打断当前对局。

日志和状态：

```bash
docker compose logs -f resources
curl http://127.0.0.1:18080/api/resources/status
```

状态包含 `ready/phase/version`、文件数量、字节数和本轮同步信息。未完成首次设置时 `phase=setup`、`setupRequired=true`，下载和检查接口返回 428，不产生上游请求。`GET /api/resources/setup` 读取存储设置；`POST /api/resources/setup` 以 JSON `{ "directory": "/data/cards" }` 完成首次设置，保存后不会接受其他页面改写为不同目录。

`update` 为当前或最近一次任务，包含 `id/phase/hasUpdates/core/assets/changed/downloadedBytes/active/failed/missing`。使用 `/api/resources/status?language=cn&job=<id>` 可读取对应任务；最近 8 次已结束任务会暂存于服务内存中。

## 开发和配置

需要 Node 24。在本仓库执行：

```bash
npm ci
npm run dev
```

开发命令会同时启动资源服务和 Vite，并自动连接。首次打开网页填写仓库外的数据目录后才开始下载。无需先填写 `.env`；如已有旧路径变量，仅作为首次设置的预填建议，仍需网页确认。日志会打印实际使用的绝对路径。只启动前端使用 `npm run dev:frontend`，只启动资源接口使用 `npm run resources:serve`。下载来源和语言配置在本仓库 `resources/upstream.json`。

| 环境变量                                    | 默认值                         | 用途                                              |
| ------------------------------------------- | ------------------------------ | ------------------------------------------------- |
| `NEOS_RESOURCE_DATA_DIR`                    | Docker `../neos-data`          | 可选宿主机挂载根；Node 下作为首次设置的目录建议   |
| `NEOS_RESOURCE_CONFIG_DIR`                  | `../neos-config`               | 首次设置的持久化配置目录；Docker 容器内 `/config` |
| `NEOS_RESOURCE_STORAGE_BASE`                | Docker `/data`，Node 不限制    | 网页可选目录范围；Docker 挂载边界                 |
| `NEOS_RESOURCE_CONCURRENCY`                 | `6`                            | 下载并发，范围 1–16                               |
| `NEOS_RESOURCE_AUTO_SYNC`                   | `1`                            | 已确认存储后自动同步；`0` 仅由网页触发检查        |
| `NEOS_RESOURCE_OFFLINE`                     | `0`                            | `1` 禁止访问上游，只使用现有数据                  |
| `NEOS_PORT`                                 | `18080`                        | Docker 网页端口                                   |
| `NEOS_RESOURCE_DIR`                         | Docker 中 `/data`              | 首次设置的目录建议兼容变量，优先于 DATA_DIR       |
| `NEOS_RESOURCE_HOST` / `NEOS_RESOURCE_PORT` | `0.0.0.0` / `8788`             | Node 资源服务监听地址与端口                       |
| `NEOS_RESOURCE_URL`                         | Docker `http://resources:8788` | 资源代理兼容变量；统一开发命令自动连接本机服务    |

原 `.env` 中的 `NEOS_RESOURCE_NETWORK` 已不再需要。旧的 `http://neos-resources:8788` 地址保留容器网络别名兼容；无需继续运行独立项目。

## 验证

```bash
npm run test:resources
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e -- tests/e2e/local-resources.spec.ts tests/e2e/resource-updates.spec.ts tests/e2e/resource-storage.spec.ts --workers=1
```

默认浏览器测试通过模拟资源接口验证交互；内置资源服务使用离线模式，测试数据和配置分别指向系统临时目录中的 `neos-ts-e2e-resources` 和 `neos-ts-e2e-config`，不会下载完整卡图库或使用正式数据。实时测试可通过 `PLAYWRIGHT_LIVE=1` 启用实际资源连接，需要先在网页完成存储设置。
