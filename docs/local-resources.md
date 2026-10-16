# 独立资源服务

卡片数据库（含效果文本）、卡图、禁限表、先行卡配置、提示文本和字体由独立项目 **neos-resources** 保存和更新。本仓库只构建前端及其反向代理，不再包含资源同步程序，不再创建或挂载资源数据卷。音乐、音效、界面素材及 SQL.js WASM 仍随前端打包。

浏览器继续访问当前站点的 `/local-resources/` 和 `/api/resources/`，由反向代理连接独立服务。每次完整打开或刷新网页仍会检查更新；资源服务后台同步，失败时保留已保存文件，正在进行的对局不会强制刷新。

## 首次部署

先在 neos-resources 项目目录运行：

```bash
cp .env.example .env
docker compose up --build -d
```

这会独立创建资源服务、Docker 网络 `neos-resources` 和持久化卷 `neos-resource-data`。数据建议预留 4 GB。首次启动先准备核心卡库，再后台下载全量卡图。资源服务的 Node 端口默认为 `8788`，只映射到宿主机回环地址；前端通过共享 Docker 网络连接。

再在 neos-ts 目录运行：

```bash
git switch feat/mdpro3-duel-parity
git pull --ff-only origin feat/mdpro3-duel-parity
docker compose up --build -d --remove-orphans
```

网页地址仍为 `http://服务器IP:18080`。普通前端更新只需重复最后两条命令；资源项目可独立更新、重启及备份。前端服务停止或重建均不影响资源数据。

## 迁移现有数据

已部署过本分支内置资源服务的用户，在更新前先进入旧 neos-ts 目录，获取现有卷名并停止原资源服务：

```bash
docker inspect "$(docker compose ps -q resources)" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}'
docker compose stop resources
```

将输出的卷名写入新 neos-resources 项目 `.env` 的 `NEOS_RESOURCE_VOLUME`。在资源项目启动服务，然后更新并重建前端。新项目会直接复用原 `files/`、`state.sqlite` 和同步标记，无需重新下载已有卡图。

若旧部署已停止，可用 `docker volume ls` 查找原卷，通常名为 `neos-ts_resource-data`；以实际卷名为准。保持旧资源容器停止，避免两个进程同时同步同一目录。前端的 `--remove-orphans` 清理旧资源容器，不删除原卷。不要在旧项目运行 `docker compose down -v`，它仍可能拥有这个被复用的卷。

Node 开发环境只需在新资源项目设置 `NEOS_RESOURCE_DIR` 指向旧 `resource-data/` 的绝对路径。

## 前端连接配置

可以复制 `.env.example` 为 `.env`，按需配置：

| 变量                    | Docker 默认值                | 用途                             |
| ----------------------- | ---------------------------- | -------------------------------- |
| `NEOS_RESOURCE_URL`     | `http://neos-resources:8788` | 独立服务地址，不含路径和末尾斜杠 |
| `NEOS_RESOURCE_NETWORK` | `neos-resources`             | 资源项目已创建的 Docker 网络名   |
| `NEOS_PORT`             | `18080`                      | 网页端口                         |

`NEOS_RESOURCE_URL` 在容器启动时写入 Nginx 配置，修改后运行 `docker compose up -d` 即可，不需要编译前端。Nginx 会重新解析 Docker DNS，资源容器重启后可以继续连接。资源文件通过 HTTP 从独立服务发送，前端不读取资源文件目录。

默认需要先启动资源项目，前端才能加入其外部网络。若资源部署在其他主机，应将 `NEOS_RESOURCE_URL` 配置为其 HTTP/HTTPS 入口；同源代理继续转发前端 Host 和 Origin，资源入口需转发给资源服务。仍需先创建本配置要求的 Docker 网络，或按自身部署方式修改网络配置。

## 开发与测试

在 neos-resources 项目启动 `npm start`（Node 24，无第三方依赖），再在本仓库运行：

```bash
npm ci
npm run dev
```

Vite 只启动前端，默认将资源请求转发到 `http://127.0.0.1:8788`。可通过环境变量或 `.env.development.local` 的 `NEOS_RESOURCE_URL` 覆盖，不会自动启动同步或下载任务。

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e -- tests/e2e/local-resources.spec.ts --workers=1
```

默认浏览器测试会模拟资源接口，无需启动资源服务；实时浏览器测试需要单独启动它。资源服务的单元测试在独立项目中通过 `npm test` 运行。

## 进度与备份

在资源项目目录查看日志及状态：

```bash
docker compose logs -f resources
curl http://127.0.0.1:8788/api/resources/status
```

也可通过前端地址访问 `/api/resources/status`。状态包含 `ready`、`phase`、`version`、文件数量和字节数，以及本轮 `total/completed/missing/failed`。`ready` 表示必要卡库已准备好，`phase=idle` 表示当前没有同步任务，`missing` 表示上游返回 404。

备份及恢复在资源项目执行：先停止服务，再复制 `/data`，完成后重新启动。具体上游配置、更新策略、环境变量及备份命令见 neos-resources 项目的 README。前端代码和部署不再管理资源数据生命周期。
