# Admin UI（零依赖静态版）

这是一个为 `cursor2api` 准备的最小侵入式管理前端原型，目标是：

- 不引入前端构建工具与大型依赖
- 不修改后端主干文件即可先完成 UI 原型
- 未来仅需把该目录作为静态资源挂载到 `/admin`

## 推荐接入方式

后端后续只需要补三个只读接口：

- `GET /admin/api/endpoints`
- `GET /admin/api/stats`
- `GET /admin/api/requests`

前端已内置兼容策略：

- 若 `/admin/api/endpoints` 未就绪，则回退使用根路径 `/` 返回的 `endpoints`
- 若 `/admin/api/stats` 与 `/admin/api/requests` 未就绪，则显示空状态或演示数据
- 若整站接口无法访问，可点击“演示数据”直接预览 UI

## 目录说明

- `index.html`：页面结构
- `styles.css`：样式
- `app.js`：数据获取、容错、表格交互

## 建议的后端返回契约

### `/admin/api/endpoints`

```json
{
  "items": [
    {
      "name": "anthropic_messages",
      "method": "POST",
      "path": "/v1/messages",
      "source": "admin-api"
    }
  ]
}
```

### `/admin/api/stats`

```json
{
  "totalRequests": 1824,
  "requests24h": 264,
  "successRate": "98.9%",
  "avgLatencyMs": 1284,
  "latestError": "上游 429 限流",
  "healthStatus": "ok",
  "version": "2.0.0",
  "endpointCount": 4
}
```

### `/admin/api/requests`

```json
{
  "items": [
    {
      "id": "req_1001",
      "timestamp": "2026-03-06T10:20:30.000Z",
      "method": "POST",
      "path": "/v1/messages",
      "status": 200,
      "latencyMs": 1498,
      "model": "anthropic/claude-sonnet-4.6",
      "clientIp": "127.0.0.1",
      "stream": true,
      "error": ""
    }
  ]
}
```

## 为什么选择这个方案

- **KISS**：只有原生 HTML/CSS/JS，没有构建链负担
- **YAGNI**：首版只做观测展示，不引入状态管理、路由库、鉴权系统
- **DRY**：所有数据都走统一 `fetchJson()` 和统一渲染函数
- **低侵入**：未来上游同步时，仅需挂载静态目录与新增只读接口
