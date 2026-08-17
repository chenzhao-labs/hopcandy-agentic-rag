# HopCandy 后端 v0.1

该适配层提供冻结发布数据，并提供一个可选、受保护的 Live Agent 接口。模块导入时不会加载
Agent、模型、索引或语料。

## 接口

```text
GET  /api/v1/health
GET  /api/v1/meta
GET  /api/v1/examples
GET  /api/v1/experiments
POST /api/v1/query
```

读取接口使用 `hopcandy/public_data` 下的确定性发布制品。后端离线时，浏览器仍可使用同一批
文件继续展示 Replay。

`POST /api/v1/query` 仅供受信任的 Vercel 服务端代理调用。它要求
`X-HopCandy-Backend-Token`，同时只接受一个活动请求；阻塞式 Agent 运行结束后返回完整的
`hopcandy-api-v1` 响应。浏览器不得获得后端 Token，也不得直接调用 GPU 服务器。

## 本地仅回放服务

```powershell
.\.venv\Scripts\uvicorn.exe hopcandy.backend.app:app --host 127.0.0.1 --port 8000
```

默认配置为 `HOPCANDY_LIVE_ENABLED=false`，因此 `/api/v1/health` 会报告
Replay 可用、Live 离线。

## 按需 GPU 配置

以 `hopcandy/backend/.env.example` 作为变量清单。真实值只能写入 GPU 服务器环境，绝不能
提交 `.env` 文件。Live 就绪依赖服务 Token、六份年报索引、语料、Machine Facts 和实体目录。
在完成 Step 8 所要求的真实结构化与文本型联调前，任何公开 Live 状态都不得标记为就绪。
