# Phase 1 交付说明 — 小程序骨架 + 登录 + API

> 日期：2026-09-18　状态：代码完成，构建验证见文末
> 原则：复用 > 重写；对现有 learn.xiyuzero.com 只做纯增量（新增 6 个文件），零页面改动，4505 卡数据零改动。

## 1. 交付内容

### 1.1 小程序（`C:\Users\Administrator\WorkBuddy\2026-09-18-16-42-00\xiyuzero-miniprogram\`）

| 部分 | 说明 |
|---|---|
| 框架 | Taro 4.2.1 + React 18.3.1 + TypeScript（审计 §9 选型） |
| 页面 | 学习（首页今日任务）/ 复习 / 词库（API 分页+搜索）/ 我的 |
| TabBar | 学习 · 复习 · 词库 · 我的（极简四 tab，PRD §5） |
| 复用逻辑层 | `src/shared/`：types.ts / srs.ts / answer.ts / selectors.ts ← 从 Web repo 复制，算法零改动（selectors 参数化了 units 与 todayKey，逻辑一致） |
| 服务层 | `services/request.ts`（统一请求/401 重登/离线错误）、`services/auth.ts`（wx.login 静默登录 + useAuth hook）、`services/units.ts`（分页/搜索/会话批量取卡） |
| 本地存储 | `utils/storage.ts`：token / 用户 / reviews 缓存 / 离线事件队列（限 200 条防溢出） |
| 组件 | Loading / EmptyState / ErrorState（统一状态组件，含重试） |
| 设计系统 | `styles/tokens.scss`：与 Web 相同的 #F7F8FA / #182230 / #C62828 / #F4B400，圆角 36rpx |

### 1.2 后端（Web repo 纯增量 6 文件，不修改任何现有文件）

| 文件 | 作用 |
|---|---|
| `app/api/auth/wechat/route.ts` | wx.login code → code2Session → upsert wechat_accounts/users → JWT（幂等，openid 不作业务 ID） |
| `app/api/units/route.ts` | 词库分页/搜索/按 ids 批量取 5D 完整卡（直接 import data/units.ts，**零数据复制**） |
| `app/api/me/route.ts` | JWT 校验 + 用户信息（Phase 3/4 扩展概览） |
| `app/api/health/route.ts` | 连通性/配置自检（db/wechat/jwt 是否配置） |
| `lib/auth-jwt.ts` | 零依赖 HS256 JWT（node:crypto） |
| `lib/db.ts` | Supabase PostgREST 薄封装（fetch，零新增 npm 依赖） |
| `supabase/migrations/0001_init.sql` | 12 张表 + RLS + 触发器（全部新建，无迁移风险） |
| `.env.example` | 环境变量模板（secret 只在服务端） |

## 2. 上线前必做清单（按顺序）

1. **注册小程序主体**：mp.weixin.qq.com 注册（建议类目：教育 > 学习辅导，或工具 > 效率），拿到 AppID/AppSecret
2. **建 Supabase 项目**（推荐新加坡区，延迟可接受）→ SQL Editor 执行 `supabase/migrations/0001_init.sql`
3. **Vercel 配置环境变量**（xiyuzero-learn 项目 → Settings → Environment Variables）：
   - `WECHAT_APPID` / `WECHAT_SECRET`
   - `JWT_SECRET`（`openssl rand -hex 32` 生成）
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
4. **域名合规二选一**（审计 R3，xiyuzero.com 目前未备案）：
   - a. ICP 备案 learn.xiyuzero.com（周期 2-4 周，需国内服务主体）
   - b. API 部署微信云托管（默认域名免备案，代码零改动——API 均为标准 Request/Response）
   - 在此之前：开发者工具勾选「不校验合法域名」全流程开发
5. **小程序后台配置服务器域名**：request 合法域名加入 API 域名（上一步定案后）
6. 微信开发者工具导入 `xiyuzero-miniprogram` 目录，AppID 填正式号

## 3. 阶段衔接

- Phase 2（5D 学习引擎）将接入：`services/units.fetchUnitsByIds()` 取卡 → 新建 `pages/session/` 五步卡 + Output 评分 → 评分写 `shared/srs.scheduleNext()`
- Phase 3（SRS 服务端化）将接入：`POST /api/reviews` 批量提交（含离线队列 `pushPendingEvent` 的同步），首页概览切换 `GET /api/today`
- 首页 `localOverview()` 是骨架期本地拼装，Phase 3 替换为服务端数据

## 4. 验证结果

- 小程序 `npm run build:weapp`：见下（构建输出）
- Web `npm run build`：见下（必须与改动前一致通过，证明纯增量无破坏）
- `npm run typecheck`（小程序 tsc --noEmit）：见下

（本节由构建执行后回填）
