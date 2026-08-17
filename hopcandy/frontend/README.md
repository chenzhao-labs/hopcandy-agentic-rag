# HopCandy 前端

HopCandy v0.1 的正式 React 工作台。它只渲染通过版本校验的 Step 2 发布数据，并消费
`hopcandy-api-v1` 契约。

## 本地运行

```powershell
cd hopcandy/frontend
npm ci
npm run test
npm run build
npm run dev
```

公开仓库已包含经过冻结的前端发布快照，因此无需运行私有工程工作区中的数据生成脚本。

Replay 始终可用。Live 默认关闭；只有 `VITE_HOPCANDY_LIVE_ENABLED=true` 且健康检查报告后端
就绪时，才会调用同源 `/api/v1` 代理。

## 当前 Vercel 部署

当前首发不连接 Supabase，前端直接读取 `public/data` 中的冻结 JSON。导入 GitHub 仓库到
Vercel 时，设置 Root Directory 为 `hopcandy/frontend`，Framework Preset 为 Vite，安装命令为
`npm ci`，构建命令为 `npm run build`，输出目录为 `dist`。

`vercel.json` 已将所有前端路由重写到 `index.html`，因此可直接访问或刷新
`/experiments`、`/architecture`。Vercel 环境变量中保持
`VITE_HOPCANDY_LIVE_ENABLED=false`，不配置 `VITE_SUPABASE_URL` 和
`VITE_SUPABASE_PUBLISHABLE_KEY`。
