# 西语Zero 微信小程序（xiyuzero-miniprogram）

面向中文母语者的西班牙语 0→B2 主动词汇学习小程序。与 Web 端
[learn.xiyuzero.com](https://learn.xiyuzero.com) 共享同一套词库（4505 条 5D 学习卡）、
SRS 算法与（新建的）共享后端。

- 技术栈：Taro 4 + React 18 + TypeScript
- 审计与架构：见 [docs/AUDIT.md](./docs/AUDIT.md)
- Phase 1 说明：见 [docs/PHASE-1.md](./docs/PHASE-1.md)

## 快速开始

```bash
npm install          # 安装依赖
npm run dev:weapp    # 开发模式（watch）
npm run build:weapp  # 生产构建 → dist/
npm run typecheck    # 类型检查
```

用微信开发者工具导入本目录（AppID 见 project.config.json，当前为测试号 touristappid），
**开发期请勾选「详情 → 本地设置 → 不校验合法域名」**（上线前需完成域名合规，见 PHASE-1.md）。

## 后端

API 复用 learn.xiyuzero.com（Vercel）新增的 `/api/*` 路由，数据库为 Supabase Postgres。
配置与环境变量见 Web 仓库 `.env.example` 与 `supabase/migrations/0001_init.sql`。

## 目录结构

```
src/
  shared/      复用 Web 端纯逻辑（types / srs / answer / selectors）——两端保持一致
  services/    request（网络层）/ auth（微信登录）/ units（词库访问）
  utils/       storage（token/缓存/离线队列）
  components/  统一状态组件（Loading/Empty/Error）
  styles/      设计 tokens（与 Web 相同视觉语言）
  pages/       learn 首页 / review 复习 / library 词库 / my 我的
```
