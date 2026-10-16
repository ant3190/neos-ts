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
- 默认通过上游 S3 批量索引核对卡库、禁限、先行卡及中英文卡图，只请求索引和发生变化的文件。索引默认复用 5 分钟，检查记录保存在数据目录，重启或重建容器继续复用；不再每次逐张发送卡图条件请求。
- 索引未覆盖的资源继续采用条件检查：卡库和配置默认复用 5 分钟，已有卡图与字体默认 24 小时复核一次。新资源、本地丢失的文件及上次失败的下载仍会补齐。已确认的 404 缓存 1 小时；索引中新出现的文件会立即绕过旧的缺失记录重新下载。
- 显示当前阶段、已处理项数、已更新项数、实际下载量和当前文件的下载进度。处理项数包含无需重新下载的文件，百分比表示当前阶段的处理进度。
- 读取索引时显示目录进度和已读取页数。索引失败不会弹出更新提示打断页面，左下角提供入口查看原因、重新检查；已保存的卡库和卡图继续可用。
- 点击“后台更新”收起弹窗，左下角可重新查看；关闭网页不会取消服务器上的下载。
- 更新任务由多个页面共享；按任务编号读取进度，其他页面的检查不会覆盖当前窗口正在查看的任务。
- 使用 ETag、Last-Modified 和 SHA-256 检查变化；验证文件格式与 SQLite 完整性后原子替换，失败时保留旧版本。验证标记变了但内容相同不会误报更新。
- 下载失败可以重试，连接中断会自动重连。完成后由用户点击“刷新加载新数据”，不会自动刷新或打断当前对局。
- 卡图 CDN 返回 404 时会继续尝试备用 CDN，只有两个来源都返回 404 才归为缺失；404 与超时、503 等混合出现时按下载失败处理，避免误报缺失。弹窗列出具体缺失文件及卡号，可点击“重新检查”。详情最多展示 100 项，完整缺失文件名会写入资源服务日志。
- “重新检查 / 重试更新”会立即核对卡库和重试缺失文件，继续复用其他有效资源。系统设置 → 资源 → “完整检查资源”会绕过时间缓存、重新计算本地文件哈希并逐项核对，适合手动修复，也会显示进度；完整检查耗时较长。

日志和状态：

```bash
docker compose logs -f resources
curl http://127.0.0.1:18080/api/resources/status
```

状态包含 `ready/phase/version`、文件数量、字节数和本轮同步信息。`update` 为当前或最近一次任务，包含 `id/phase/hasUpdates/core/assets/changed/downloadedBytes/active/failed/missing/index`。`assets.total/completed` 仅计算本轮需要核对或下载的文件，`assets.cached` 为复用的本地文件数；`index` 包含 `active/total/completed/pages/cached/failed`，分别表示是否读取中、目录总数、完成目录数、已读页数、复用目录数与失败目录数。索引失败时任务为 `partial`，与实际文件下载失败分开计数。使用 `/api/resources/status?language=cn&job=<id>` 可读取对应任务；最近 8 次已结束任务会暂存于服务内存中。

也可用 `POST /api/resources/check?retry=1` 重试，或 `POST /api/resources/check?full=1` 完整检查。多个页面仍共享任务，运行中的快速检查可升级为完整检查，任务编号保持不变。

## 默认 S3 批量索引

已接入萌卡备用 CDN 的公开 `ListObjectsV2` 接口，无需创建第二个项目或维护自建清单：

```dotenv
NEOS_RESOURCE_S3_INDEX_URL=https://cdncf.moecube.com/
NEOS_RESOURCE_CHECK_INTERVAL=300
```

默认值已经生效，不必在旧 `.env` 中补写。显式设置 `NEOS_RESOURCE_S3_INDEX_URL=` 可关闭 S3 索引，恢复时间缓存与逐项检查。

- 只列出已配置资源对应的目录，按每页最多 1,000 项读取，使用返回的 continuation token 继续分页；不会下载目录中其他未被项目使用的文件。
- 根据远端 ETag 和大小与 `state.sqlite` 中的下载记录比较，只有新文件、缺失文件或版本不同的文件才下载。ETag 作为版本标记使用，不假定它一定是 MD5 或 SHA-256。
- 同一轮检查里每个目录只读一次；完整目录快照存入 `state.sqlite` 的 `resource_indexes` 表，默认复用 5 分钟。短时间刷新页面或重建容器后无需重扫卡图。设置检查间隔为 `0` 可在每次检查时重新读取索引。
- 只有全部分页成功并通过 XML/字段校验后，才启用新目录快照。分页失败、重复 token、损坏 XML 或 HTTP 错误会保留原有快照和文件，报告检查未完成，并回退到缓存及逐项检查；失败的目录自动退避 1 分钟，手动重试可以立即再查。
- 下载后再核对索引 ETag 和大小；主 CDN 尚未同步时会尝试备用 CDN，失败则保留原文件。比本地文件更旧的索引版本不会用于回退本地数据。下载内容仍会计算 SHA-256，只有实际内容变化才提示更新。
- 字体来源不在该 S3 存储中，仍通过原有条件请求与缓存更新。S3 清单未列出的文件不会被自动删除，也不会仅凭清单缺项就当成上游 404。

冷检查需要按目录分页，因此实际是若干到几十次索引请求，不是“整个远端只请求一次”；旧版则需要逐张请求全部卡图。实际时间取决于 CDN 响应和资源数量。频繁刷新会复用本地快照，“重新检查”和“完整检查”会绕过索引缓存。

## 可选 SHA-256 清单

如果资源发布方另行提供与下载文件对应的 SHA-256 清单，也可设置 `.env` 中的 `NEOS_RESOURCE_MANIFEST_URL`。清单覆盖的文件优先使用其哈希，不重复读取 S3 索引；其余文件继续使用 S3 或时间缓存。清单覆盖全部资源且没有变化时只需 **1 个上游请求**；无需逐张请求卡图，也不会每次重新读取整套卡图计算哈希。

清单的 JSON 格式如下，哈希必须是实际文件内容的 64 位 SHA-256，文件名与本地资源键相同：

```json
{
  "schema": 1,
  "files": {
    "images/ygopro-images-zh-CN/46986414.jpg": "实际文件的64位SHA256",
    "ygopro-database/zh-CN/cards.cdb": "实际文件的64位SHA256"
  }
}
```

该示例中的哈希需替换后才能使用。发布方应先上传资源，再原子发布新清单，尽量支持 ETag 或 Last-Modified；清单中的哈希也用于下载后的校验，CDN 尚未同步或内容错误时保留原文件并报告失败。清单只能为已有资源指定哈希，不能引入其他下载地址，也不会删除本地文件。

默认 S3 索引无需配置这份自定义 JSON 清单。不应把游戏安装包版本或本机旧快照当成实时清单。自定义清单失效或格式错误时会报告检查不完整并回退。关闭 S3、未配置自定义清单或二者都未覆盖的资源走时间缓存，卡图单独修改可能要到下一次复核才发现。所有索引、缓存和检查程序仍在原项目中。

## 开发和配置

需要 Node 24。在本仓库执行：

```bash
npm ci
npm run dev
```

开发命令会同时启动资源服务和 Vite，并自动连接。启动前同样需要在本仓库 `.env` 中显式配置 `NEOS_RESOURCE_DATA_DIR`；未配置时不会自动选择目录或开始下载。日志会打印实际使用的绝对路径。只启动前端使用 `npm run dev:frontend`，只启动资源接口使用 `npm run resources:serve`。下载来源和语言配置在本仓库 `resources/upstream.json`。

| 环境变量                                    | 默认值                         | 用途                                             |
| ------------------------------------------- | ------------------------------ | ------------------------------------------------ |
| `NEOS_RESOURCE_DATA_DIR`                    | 必填，无默认值                 | 宿主机或 Node 的数据目录                         |
| `NEOS_RESOURCE_CONCURRENCY`                 | `6`                            | 下载并发，范围 1–16                              |
| `NEOS_RESOURCE_CHECK_INTERVAL`              | `300`                          | S3 目录及未索引卡库的检查缓存秒数，`0` 每次核对  |
| `NEOS_RESOURCE_ASSET_CHECK_INTERVAL`        | `86400`                        | 无清单覆盖的卡图、字体复核间隔秒数，`0` 每次核对 |
| `NEOS_RESOURCE_MANIFEST_URL`                | 空，不启用                     | 对应当前下载源的权威 SHA-256 清单地址            |
| `NEOS_RESOURCE_S3_INDEX_URL`                | `https://cdncf.moecube.com/`   | 上游公开 S3 索引地址，显式留空关闭               |
| `NEOS_RESOURCE_AUTO_SYNC`                   | `1`                            | `0` 关闭服务启动时同步，网页仍能触发检查         |
| `NEOS_RESOURCE_OFFLINE`                     | `0`                            | `1` 禁止访问上游，只使用现有数据                 |
| `NEOS_PORT`                                 | `18080`                        | Docker 网页端口                                  |
| `NEOS_RESOURCE_DIR`                         | Docker 中 `/data`              | Node 数据路径兼容变量，优先于 DATA_DIR           |
| `NEOS_RESOURCE_HOST` / `NEOS_RESOURCE_PORT` | `0.0.0.0` / `8788`             | Node 资源服务监听地址与端口                      |
| `NEOS_RESOURCE_URL`                         | Docker `http://resources:8788` | 资源代理兼容变量；统一开发命令自动连接本机服务   |

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
