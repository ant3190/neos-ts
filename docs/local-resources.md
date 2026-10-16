# 一个项目，数据单独存放

前端、资源接口和同步程序都在 **neos-ts** 本仓库中，统一构建和启动。卡片数据库（含效果文本）、卡图、禁限表、先行卡配置、提示文本和字体等下载数据放在仓库外，不进入 Git，也不打包进镜像。

## 部署

先在 neos-ts 的 `.env` 中显式设置数据目录。首次部署可参考 `.env.example`，已有 `.env` 直接编辑：

```dotenv
NEOS_RESOURCE_DATA_DIR=/mnt/data/neos-data
```

该项必填，无默认目录；未设置或留空时，Docker Compose 和本地资源服务都会提示并停止启动。然后只在 neos-ts 目录运行：

```bash
git switch feat/mdpro3-duel-parity
git pull --ff-only origin feat/mdpro3-duel-parity
docker compose up --build -d --remove-orphans
```

同一个 Compose 项目会启动前端和资源服务。网页仍为 `http://服务器IP:18080`，资源服务仅在内部网络提供接口，不需要单独克隆、启动或更新 neos-resources 项目，也不需要预先创建外部 Docker 网络。

首次启动会优先下载必要卡库，再在后台同步全量卡图。数据目录建议预留 4 GB；浏览器只加载实际使用的资源。

## 数据放在哪里

数据位置完全由 **`NEOS_RESOURCE_DATA_DIR`** 决定。例如设为 `/mnt/data/neos-data`，所有数据就在该宿主机目录。Docker 会自动创建所选目录，并挂载到资源容器的 `/data`；资源服务启动日志会打印容器内的数据路径，宿主机路径可通过 `docker compose config` 查看：

| 宿主机数据目录内容 | 用途                                         |
| ------------------ | -------------------------------------------- |
| `files/`           | 卡库、效果文本、卡图、禁限等实际资源         |
| `state.sqlite`     | 上游校验标记、文件哈希、检查时间等同步元数据 |
| `work/`            | 临时下载文件                                 |

要换到其他目录或磁盘，修改本仓库 `.env` 中的路径：

```dotenv
NEOS_RESOURCE_DATA_DIR=/mnt/data/neos-data
```

路径可以是仓库外的相对路径，也可以是绝对路径。更换路径前先停止资源服务并将旧数据完整复制到新位置，再启动；否则空目录会触发首次同步。

重建镜像、重启、`docker compose down` 甚至 `down -v` 都不会删除这个宿主机目录。备份时先运行 `docker compose stop resources`，完整复制数据目录，再运行 `docker compose start resources`。

## 从网页目录设置切换到 .env

数据路径统一由本仓库 `.env` 决定。网页目录设置、设置接口和 `/config` 挂载已移除；服务不再读取 `neos-config/storage.json`，也不会创建 `neos-config` 目录。原 `.env` 中的 `NEOS_RESOURCE_CONFIG_DIR` 和 `NEOS_RESOURCE_STORAGE_BASE` 可以移除。

复用已有数据时，将 `NEOS_RESOURCE_DATA_DIR` 直接指向包含 `files/` 和 `state.sqlite` 的宿主机目录。假设原 Docker 数据挂载根为 `/mnt/data/neos-data`：

| 原网页选择的路径 | 新 `.env` 中的 `NEOS_RESOURCE_DATA_DIR` |
| ---------------- | --------------------------------------- |
| `/data`          | `/mnt/data/neos-data`                   |
| `/data/cards`    | `/mnt/data/neos-data/cards`             |

原网页选择可以从旧配置目录里的 `storage.json` 的 `directory` 字段查看。Node 直接运行时，将该字段中的绝对路径原样写入 `.env` 即可。设置正确的原数据路径后重建容器，旧卡图、卡库和同步标记会继续复用，无需移动或重新下载相同文件。旧配置目录会留在宿主机，程序不再使用它。

## 从之前的独立资源项目迁回

如果已经使用 neos-resources 项目下载过数据，先在旧项目目录停止服务并复制数据，旧数据会保留：

```bash
docker compose stop resources
mkdir -p /srv/neos-data
docker compose cp resources:/data/. /srv/neos-data/
```

然后在 neos-ts 的 `.env` 设置 `NEOS_RESOURCE_DATA_DIR=/srv/neos-data`，按上面的单项目命令启动。复制完整的 `files/` 和 `state.sqlite` 后，新服务会复用卡图及同步标记，无需重新下载。保持旧资源服务停止，避免两套服务同时操作同一份数据。后续只更新和部署 neos-ts。

若更早使用的是 neos-ts 内置命名卷，同样先停止旧资源容器并执行 `docker compose cp resources:/data/. /srv/neos-data/`，再切换配置。若使用 Node 直接运行，原数据已在仓库外时可将 `NEOS_RESOURCE_DATA_DIR` 指向原目录；原数据还在仓库内时，先停止服务并将整个数据目录移到仓库外，再设置新路径。

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

状态包含 `ready/phase/version`、文件数量、字节数和本轮同步信息。`update` 为当前或最近一次任务，包含 `id/phase/hasUpdates/core/assets/changed/downloadedBytes/active/failed/missing`。使用 `/api/resources/status?language=cn&job=<id>` 可读取对应任务；最近 8 次已结束任务会暂存于服务内存中。

## 开发和配置

需要 Node 24。在本仓库执行：

```bash
npm ci
npm run dev
```

开发命令会同时启动资源服务和 Vite，并自动连接。启动前同样需要在本仓库 `.env` 中显式配置 `NEOS_RESOURCE_DATA_DIR`；未配置时不会自动选择目录或开始下载。日志会打印实际使用的绝对路径。只启动前端使用 `npm run dev:frontend`，只启动资源接口使用 `npm run resources:serve`。下载来源和语言配置在本仓库 `resources/upstream.json`。

| 环境变量                                    | 默认值                         | 用途                                           |
| ------------------------------------------- | ------------------------------ | ---------------------------------------------- |
| `NEOS_RESOURCE_DATA_DIR`                    | 必填，无默认值                 | 宿主机或 Node 的数据目录                       |
| `NEOS_RESOURCE_CONCURRENCY`                 | `6`                            | 下载并发，范围 1–16                            |
| `NEOS_RESOURCE_AUTO_SYNC`                   | `1`                            | `0` 关闭服务启动时同步，网页仍能触发检查       |
| `NEOS_RESOURCE_OFFLINE`                     | `0`                            | `1` 禁止访问上游，只使用现有数据               |
| `NEOS_PORT`                                 | `18080`                        | Docker 网页端口                                |
| `NEOS_RESOURCE_DIR`                         | Docker 中 `/data`              | Node 数据路径兼容变量，优先于 DATA_DIR         |
| `NEOS_RESOURCE_HOST` / `NEOS_RESOURCE_PORT` | `0.0.0.0` / `8788`             | Node 资源服务监听地址与端口                    |
| `NEOS_RESOURCE_URL`                         | Docker `http://resources:8788` | 资源代理兼容变量；统一开发命令自动连接本机服务 |

原 `.env` 中的 `NEOS_RESOURCE_NETWORK` 已不再需要。旧的 `http://neos-resources:8788` 地址保留容器网络别名兼容；无需继续运行独立项目。

## 验证

```bash
npm run test:resources
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e -- tests/e2e/local-resources.spec.ts tests/e2e/resource-updates.spec.ts --workers=1
```

默认浏览器测试通过模拟资源接口验证交互；内置资源服务使用离线模式，测试数据显式写入系统临时目录中的 `neos-ts-e2e-resources`，不会下载完整卡图库或使用配置的正式数据。实时测试可通过 `PLAYWRIGHT_LIVE=1` 启用实际资源连接，并需要配置正式数据目录。
