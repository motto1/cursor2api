# Cursor2API 管理界面与交付链路实施方案

## 目标

- 在尽量不侵入上游主逻辑的前提下，为 `cursor2api` 增加只读管理界面。
- 展示当前 API 接口、最近请求记录、核心统计指标与最近错误。
- 增加 Docker 镜像自动构建发布能力，并提供 `docker compose` 一键部署方案。
- 保持 fork 后续同步上游时的冲突面最小化。

## 设计原则

- **低耦合**：新增能力集中在 `src/admin/*` 与 `src/observability/*`，核心协议转换逻辑尽量不动。
- **可关闭**：管理界面、请求观测、日志落盘都提供配置开关。
- **轻依赖**：首版不引入数据库；使用内存环形缓冲区 + JSONL 落盘。
- **只读观测**：管理端不做管理写操作，不影响主代理行为。
- **便于同步上游**：尽量只修改 `src/index.ts`、`src/config.ts`、`src/types.ts`、构建与文档文件。

## 实施范围

### 后端新增模块

- `src/observability/types.ts`
  - 定义请求记录、聚合统计、接口元数据结构。
- `src/observability/request-store.ts`
  - 提供内存环形缓冲区。
  - 支持 JSONL 追加写入。
  - 提供列表、统计、错误摘要聚合。
- `src/observability/middleware.ts`
  - Express 请求观测中间件。
  - 记录方法、路径、状态码、耗时、IP、requestId、stream、provider、model、错误摘要。
- `src/admin/routes.ts`
  - 暴露 `/admin/api/endpoints`
  - 暴露 `/admin/api/requests`
  - 暴露 `/admin/api/stats`
  - 暴露 `/admin/api/health`
- `src/admin/endpoints.ts`
  - 统一维护对外展示的接口清单，避免在多个位置重复描述。

### 前端新增模块

- `admin/index.html`
- `admin/styles.css`
- `admin/app.js`

说明：首版采用原生静态页面，不引入额外前端框架和打包链，降低依赖和同步成本。

### 现有文件改动

- `src/index.ts`
  - 注册观测中间件。
  - 注册管理接口与静态页面托管。
  - 在根路径返回中补充管理页入口。
- `src/config.ts`
  - 增加管理界面与观测配置项。
- `src/types.ts`
  - 扩展 `AppConfig` 类型。
- `config.yaml`
  - 增加观测与管理界面默认配置。
- `Dockerfile`
  - 将静态管理页一并打入运行镜像。
- `docker-compose.yml`
  - 增加配置挂载、数据目录挂载、环境变量样例。
- `README.md`
  - 增加管理界面、Docker、Compose、镜像发布说明。

## 功能分解

### 1. 请求观测

记录字段：

- `id`
- `timestamp`
- `method`
- `path`
- `statusCode`
- `durationMs`
- `ip`
- `userAgent`
- `provider`（anthropic/openai/internal）
- `model`
- `stream`
- `success`
- `error`

实现策略：

- 通过 Express 中间件在请求开始时打点。
- 监听 `finish` / `close` 事件记录最终状态。
- 对请求体只做轻量推断：
  - Anthropic：读取 `body.model` 与 `body.stream`
  - OpenAI：读取 `body.model` 与 `body.stream`
- 默认不记录完整消息内容。
- JSONL 落盘仅存储摘要字段，避免敏感信息泄漏。

### 2. 管理接口

#### `GET /admin/api/endpoints`

返回：

- 服务名、版本
- 路由列表
- 方法、路径、描述、分类

#### `GET /admin/api/requests`

支持查询参数：

- `limit`
- `path`
- `status`
- `provider`
- `search`

返回：

- 最近请求列表
- 总记录数
- 当前过滤条件

#### `GET /admin/api/stats`

返回：

- 总请求数
- 成功数 / 失败数
- 成功率
- 平均耗时
- 最近 24 小时请求数
- 按路径聚合
- 最近错误摘要

### 3. 管理前端

页面结构：

- 概览卡片：总请求、24h 请求、成功率、平均耗时
- 接口清单：方法、路径、用途
- 调用记录：表格 + 过滤
- 最近错误：简表展示

交互策略：

- 页面加载后并行拉取 `/admin/api/stats`、`/admin/api/endpoints`、`/admin/api/requests`
- 支持手动刷新
- 支持按路径/状态码关键字过滤
- 首版不做登录；通过配置开关控制是否启用

### 4. 配置项

新增建议配置：

```yaml
admin:
  enabled: true
  path: "/admin"

observability:
  enabled: true
  max_requests: 500
  log_dir: "./data"
  persist_jsonl: true
```

环境变量覆盖建议：

- `ADMIN_ENABLED`
- `ADMIN_PATH`
- `OBS_ENABLED`
- `OBS_MAX_REQUESTS`
- `OBS_LOG_DIR`
- `OBS_PERSIST_JSONL`

### 5. Docker 与 Compose

镜像策略：

- 延续多阶段构建。
- 构建阶段编译 TypeScript。
- 运行阶段复制 `dist/`、`admin/` 与最小必要文件。
- 预创建 `/app/data` 目录用于请求日志落盘。

Compose 策略：

- 默认使用预构建镜像。
- 提供 `config.yaml` 只读挂载。
- 提供 `./data:/app/data` 数据卷。
- 提供 `3010:3010` 端口映射。

### 6. GitHub Actions

新增工作流：`.github/workflows/docker.yml`

职责：

- 在 `main` push、tag push、手动触发时执行。
- 登录 GHCR。
- 使用 Buildx 构建并推送镜像。
- 生成标签：
  - `latest`
  - `main`
  - `sha-<short>`
  - `vX.Y.Z`

## 执行顺序

1. 扩展配置类型与加载逻辑。
2. 新增请求观测存储与中间件。
3. 新增管理接口与静态页面。
4. 在 `src/index.ts` 完成最小接入。
5. 更新 Dockerfile 与 Compose。
6. 新增 GitHub Actions 工作流。
7. 更新 README。
8. 构建验证。

## 验收标准

- 现有 API：`/v1/messages`、`/v1/chat/completions`、`/v1/models` 保持兼容。
- 访问 `/admin` 可看到管理界面。
- 能看到最近请求记录与聚合统计。
- `docker compose up -d` 后可直接访问 API 与管理界面。
- GitHub Actions 能产出可拉取的镜像标签。
- 主要冲突面限制在少量入口文件与新增目录。
