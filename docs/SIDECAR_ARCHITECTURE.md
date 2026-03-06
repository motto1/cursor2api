# Cursor2API Sidecar / Gateway 架构说明

## 目标

- 将管理面板与请求观测从主服务中拆出。
- 让主服务尽量保持接近 upstream，降低后续同步冲突。
- 通过双服务 `docker compose` 保持一键部署体验。

## 服务划分

### `cursor2api-core`

- 保持仓库根目录现有 `src/*` 作为核心代理服务。
- 不再承载管理面板、请求观测与管理 API。
- 在 Compose 中仅对内暴露给 sidecar，不直接对宿主机暴露。

### `cursor2api-admin`

- 目录：`gateway/`
- 对外暴露 `3010` 端口。
- 提供 `/admin` 前端与 `/admin/api/*` 管理接口。
- 对除 `/admin` 之外的路径执行透明转发。
- 在网关层记录最近请求、统计与错误摘要。

## 请求路径

```text
Client -> cursor2api-admin -> cursor2api-core -> Cursor upstream
```

说明：

- 用户客户端统一访问 `cursor2api-admin`
- 管理面板只存在于 `cursor2api-admin`
- 观测数据只记录经过网关的代理请求

## 关键目录

- `gateway/src/index.ts`：网关入口
- `gateway/src/proxy.ts`：透明代理
- `gateway/src/admin/*`：管理 API
- `gateway/src/observability/*`：观测存储与统计
- `gateway/public/*`：管理前端静态资源
- `gateway/Dockerfile`：网关镜像构建

## 部署

- `docker-compose.yml` 默认启动：
  - `cursor2api-core`
  - `cursor2api-admin`
- 默认入口：`http://localhost:3010/admin`

## 同步 upstream 的收益

- 与 upstream 的高冲突文件（尤其 `src/index.ts`）解绑。
- 新增逻辑集中在 `gateway/`，更适合长期维护 fork。
- 后续如需同步 upstream，优先处理核心代理服务；管理面板侧基本独立。
