# HopCandy Supabase 发布数据层

此目录包含 HopCandy v0.1 可部署的数据库契约，但当前 GitHub + Vercel 首发不连接 Supabase。
Schema、RLS 与 Seed 会保留到后续登录、用户数据或远端发布数据阶段再启用。

## 数据范围与权限

- `demo_cases`、`experiments` 和 `timeline_entries` 通过行级安全（RLS）只公开
  `published=true` 的记录。
- 浏览器角色只有 `SELECT` 权限，不能插入、更新或删除。
- `query_runs` 没有浏览器授权和公开策略；受信任服务端可使用 Supabase Secret Key 写入
  经隐私最小化处理的遥测数据。
- `query_runs` 不存储原始问题。写入前，服务端必须使用轮换盐对客户端和问题标识符哈希。
- Supabase 保存已发布的 Replay 数据，不保存向量、索引、年报、模型权重或 Agent 运行时。

## 已生成的公开制品

`seed.sql` 和 `../public_data/*.json` 已由私有工程工作区中的冻结 Step 0 与 Step 1 制品生成，
公开仓库只包含可部署结果。请不要手工修改这些生成数据行。

## 后续接入边界

Step 2 所在本地工作站没有 Supabase CLI、Docker 或 `psql`，因此本阶段只静态验证可部署 SQL
和策略契约。后续接入前，应使用一次性的 Preview 项目执行 Migration，并验证真实 `anon` 只能读取
已发布记录、写操作被拒绝；通过后再部署 Production。

浏览器只可使用 `VITE_SUPABASE_URL` 和 Supabase Publishable Key。Secret Key 必须保留在仅服务端
环境变量中。当前 Vercel 部署不配置上述两个 Supabase 变量。
