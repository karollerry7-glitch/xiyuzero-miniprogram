# 《XiyuZero 微信小程序迁移审计报告》

> 审计日期：2026-09-18
> 审计对象：learn.xiyuzero.com（代码库 `xiyuzero-learn`，GitHub: karollerry7-glitch/learn.xiyuzero.com）
> 审计结论：**先读第四节「颠覆性发现」再读本报告其余部分**

---

## 0. 执行摘要

| 项 | 结论 |
|---|---|
| 现有技术栈 | Next.js 16.3.5 + React 19.2.8 + TypeScript 5 + Tailwind CSS 4，Vercel 托管 |
| 后端 / 数据库 / 用户系统 | **不存在**。全部数据存浏览器 LocalStorage |
| 词库资产 | 4505 条 Learning Units（100% 含 5D 数据），静态 TS 文件管理，质量高 |
| SRS | 自研 SM-2 变体，纯函数模块化，可直接复用 |
| 可直接复用代码 | `types/` `lib/srs.ts` `lib/answer.ts` `lib/selectors.ts`（纯逻辑，零框架依赖）+ 全部数据文件 |
| 必须重写 | 全部 UI（React/Tailwind → 小程序组件）、状态层（LocalStorage → 服务端 + 本地缓存）、登录、支付（从零建） |
| 推荐小程序方案 | **Taro 4 + React 18 + TypeScript**（备选：微信原生，见 §9） |
| 推荐共享后端 | 现有 Vercel 项目内新增 API 路由（复用静态数据文件）+ Supabase Postgres（仅服务端访问） |
| 最小 MVP | Phase 0–4 + 6 + 8–10（登录/学习/复习/SRS/词库/我的 + Free 限额）；支付为 Phase 7 独立交付 |

---

## 1. 当前技术栈

```
框架        Next.js 16.3.5（App Router）
UI          React 19.2.8 + Tailwind CSS 4（@tailwindcss/postcss）
语言        TypeScript 5（strict）
构建        next build（Vercel 云端构建，约 83s 全量）
运行时依赖   next / react / react-dom / ws（仅 /api/tts 用）
服务端路由   仅 1 个：/api/tts（Edge 神经网络 TTS 代理 + Google TTS 回退）
数据库      ❌ 无
ORM        ❌ 无
Auth       ❌ 无
用户系统     ❌ 无（无账号、无登录、无会员）
Analytics  ❌ 无
测试        ❌ 无（无单测、无 E2E、无 CI）
环境变量    ❌ 无（无任何 secret，代码库干净）
部署       Vercel 项目 temporary-fast-nitrogen-73bq227，push main 自动上线
域名       learn.xiyuzero.com（CNAME → cname.vercel-dns.com，DNSPod 管理）
Git        工作树干净，最新 commit e9c0ae3（4505/4505 5D 卡全量 + 备份还原点）
```

**移动端适配现状**：已有响应式布局（Desktop 侧边导航 / Mobile 底部 5 tab 导航），Tailwind 断点完整，学习卡片单列。移动 Web 体验可用，但非小程序原生体验。

**技术债与已知风险**：
- `/api/tts` 的 Edge TTS 使用微软公开的 TrustedClientToken 非官方接口，理论上存在被封风险（已备 Google 回退 + Web Speech 三层兜底）
- LocalStorage 数据无云备份，清缓存即丢失（PROJECT.md 已列为已知问题）
- `data/units.ts`（1.93MB）与 `data/fived.ts`（1.97MB）为生成文件，已被 .gitignore 正确管理，`scripts/build-units.mjs` / `build-fived.mjs` 管线成熟（id 唯一性由 `allocId()` 保证，SRS 进度安全）
- 无任何测试与 CI，构建即验证（`next build` 含类型检查）

---

## 2. 当前架构图

```
┌────────────────────────────────────────────────────────┐
│                    用户浏览器                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Next.js 16 静态页面（App Router, "use client"）   │  │
│  │  app/ learn review listening levels library        │  │
│  │       my stats settings onboarding page            │  │
│  │  components/ AppShell FiveDLearn VocabularyCard    │  │
│  │              AudioButton                           │  │
│  │  hooks/ useSpeech（三层 TTS）                       │  │
│  │  lib/ store.ts ←→ LocalStorage                     │  │
│  │       srs.ts answer.ts selectors.ts（纯函数）        │  │
│  │  data/ units.ts fived.ts（编译进 JS bundle）         │  │
│  └──────────────────────────────────────────────────┘  │
│            │ fetch /api/tts（唯一网络请求）               │
└────────────┼───────────────────────────────────────────┘
             ▼
┌────────────────────────────────────────────────────────┐
│  Vercel Serverless：/api/tts                            │
│  Edge TTS (WSS) → Google TTS → 502；CDN 永久缓存        │
└────────────────────────────────────────────────────────┘

数据流：全部学习状态（reviews/favorites/activity/mySentences/settings）
        ↔ localStorage["xiyuzero-learn-v1"]（单 key JSON，无跨设备同步）
```

---

## 3. 「数据库」结构（实为 LocalStorage Schema）

无数据库。完整数据模型如下（`types/index.ts`，类型定义质量高，可直接复用）：

| 实体 | 字段 | 说明 |
|---|---|---|
| `AppState` | onboarded, startLevel, settings, reviews, favorites, mySentences, activity | 顶层状态，单 key 存储 |
| `ReviewState`（每词） | status(new/learning/review/active/mastered), interval, dueDate, correctCount, wrongCount, productionCorrect/Wrong, productionDays[], lastRatedAt | SRS 状态，**缺 first_seen_at** |
| `Settings` | dailyNew(默认20), targetLevel, voiceLocale, voiceGender, rate, tracks, goal | |
| `DayActivity`（每日） | newLearned, reviewed, listening, output, recallCorrect/Total, listeningCorrect/Total, wrongIds[] | **已具备 daily_learning_stats 雏形**（用户要求的 §22 表，现有实现是按天聚合，不扫全量 review） |
| `MySentence` | id, text, date, unitIds[] | 主动造句 |

内容数据（静态文件，非数据库）：
```
data/units-core.ts   123 条手工精编（Starter/A1 核心）
data/units.ts        4382 条生成（A1 363 / A2 356 / B1 773 / B2 2890）
                     合计 4505 Learning Units
                     类型分布：word 3716 / chunk 630 / connector 27 / sentence-pattern 9+core
data/fived-core.ts   20 条手工精编 5D 卡
data/fived.ts        4505 条 5D（100% 覆盖），音节算法+种子人工词块/例句
data/seeds*/         TSV 人工种子（内容真源，管线可再生）
```

`LearningUnit` 结构：id(`^[a-z]{2}-\d{3}$`) / level(Starter,A1,A2,B1,B2) / type / spanish / lemma / chinese / partOfSpeech / article? / gender? / plural? / topic / frequency / difficulty / collocations / example / wordFamily / synonyms / antonyms / grammarNote / commonMistakes / fiveD?

`FiveD` 结构：meaning（单一核心义）/ sound{syllables, stress} / grammar[]（逐条语法点）/ chunks[]{spanish,chinese} / sentences[]（1-3 条）

**评价**：内容资产质量与结构是本项目最大财富；`FiveD` 与用户要求的 5D 学习页（Meaning→Sound→Grammar→Context→Output）几乎一一对应——小程序的 STEP 1-5 可直接映射现有 `FiveDLearn.tsx` 的逐步披露流程（现顺序为 Sound→Meaning→Grammar→Chunk→Sentence，可按小程序 PRD 调整为 Meaning→Sound→Grammar→Context→Output，纯展示顺序调整）。

---

## 4. ⚠️ 颠覆性发现：任务前提修正

**你给的 PRD 假设「已有数据库 / API / 用户系统」。实际上一个都不存在。**

现有 learn.xiyuzero.com 是纯静态站 + LocalStorage：没有后端 API（除 TTS）、没有数据库、没有用户、没有会员、没有支付、没有 Analytics。

这直接改变「不要开发两套系统、共享后端」的含义：

- **不是「复用现有后端」——是「从零新建一个共享后端」**，Web 与小程序将来都接它。
- 现有 Web 用户的「学习进度」只存在于各自浏览器里，且**没有任何账号可识别他们**。「Web ↔ 小程序账号同步」（PRD §15）的前提是 Web 端先有登录体系——这是 Web 端的改造，属于增量功能，放 Phase 5，不破坏现有静态站。
- 好消息：正因为是从零建后端，可以一次到位设计 users / wechat_accounts / 订单 / 会员表，无历史包袱；且 PRD 中全部表结构建议（§14/§20/§22）可以直接采纳。

**对现有 Web 的保护**：新建后端 = 纯增量（新增 app/api/ 路由 + 新表），静态页面零改动，learn.xiyuzero.com 继续正常运行。✅

---

## 5. 4505 张卡数据结构（审计细节）

- 存储：编译期静态 TS 文件打进 JS bundle（Web 端可接受；**小程序不可行**，见 §17 风险 R2）
- 单条体积：units+fiveD 合计平均约 0.9KB/条，全量约 4MB（未压缩）
- id 体系：等级前缀+序号，`allocId()` 保证唯一与稳定（首次持有者保留 id，SRS 进度安全）
- 内容真源：`data/seeds/` + `data/seeds5d/` TSV → 构建脚本生成 → **git 仓库即唯一数据源（Source of Truth）**
- CEFR 映射完备：Starter/A1/A2/B1/B2 五级（注：PRD 说 A1/A2/B1/B2，实际还有 Starter 级 123 条核心词，小程序 CEFR 地图应含 Starter）
- 音频：无音频文件资产，TTS 实时合成（Edge Neural es-MX/es-ES，CDN 缓存）——符合 PRD「先建立播放架构，不批量生成 4505 个音频」的要求，现有架构天然满足

## 6. 现有 SRS 情况

`lib/srs.ts`（113 行纯函数，无任何依赖）：

- 间隔策略：Again 10min / Hard 1d / Good 3d / Easy 7d 起步，递增 ×1.2/×2.5/×3.5，封顶 120/180 天，错误率 >35% 时 ×0.8 惩罚
- 状态机：new → learning → review；Active/Mastered 判定基于**中→西主动产出**（Active：产出正确≥2 次；Mastered：≥3 个不同日期 + ≥4 次正确 + interval≥14 天）——点一次「认识」不算掌握，符合 PRD §9
- rating 四档 again/hard/good/easy 与 PRD §8 完全一致
- 缺失字段（对照 PRD §8）：first_seen_at、last_review_at（有 lastRatedAt）、difficulty、stability（FSRS 参数）

**结论：不重写。** 现有算法成熟且已被线上验证，服务端化时补 `first_seen_at` 字段即可。FSRS 升级作为未来可选项（算法已模块化隔离，PRD 自己也说「不要为了 FSRS 强行重写」）。服务端表 `review_states` 按现有 ReviewState 结构 + first_seen_at 落库。

## 7. 可复用代码清单

| 模块 | 复用方式 | 改动 |
|---|---|---|
| `types/index.ts`（129 行） | **直接复用**（Taro 项目 npm/ts import；原生小程序走 npm 构建） | 无（小程序端新增 API DTO 类型） |
| `lib/srs.ts` | 直接复用 | 无 |
| `lib/answer.ts`（normalize/levenshtein/checkAnswer） | 直接复用 | 无 |
| `lib/selectors.ts` 的纯函数部分 | 直接复用（newQueue/dueQueue/levelProgress/vocabularyCounts 等） | 拆掉对 `todayKey()` 的 store 依赖（参数化） |
| `data/units.ts` `fived.ts` seeds 管线 | **数据源复用**：API 服务直接 import，零数据迁移、单一来源 | 无 |
| `/api/tts` | 直接复用：小程序 `InnerAudioContext` 播放远程 mp3 URL，缓存头同样生效 | 无（小程序端去掉 Web Speech 兜底层） |
| `FiveDLearn.tsx` 的**流程设计**（逐步披露、防连击、自动发音） | 参照移植，非直接复用 | 用 Taro 组件重写 UI |
| PROJECT.md / DEPLOY.md / 生成管线 skill（fived-batch-pipeline） | 文档与工作流复用 | 后续文档引用 |

## 8. 不可复用代码清单

| 模块 | 原因 | 小程序替代 |
|---|---|---|
| 全部页面/组件 JSX + Tailwind 类 | 小程序非 DOM；Tailwind 需 weapp-tailwindcss 且类名体系要重建 | Taro 组件 + 小程序样式重写（参照现有视觉规范 #F7F8FA/#182230/#C62828/#F4B400，圆角 16-20px） |
| `lib/store.ts`（useSyncExternalStore + LocalStorage） | React hook + window 依赖；且小程序需「服务端为准 + 本地缓存」双层 | 新写：API 客户端 + wx.storage 缓存 + 同步队列 |
| `hooks/useSpeech.ts` | 依赖 fetch blob/Audio/Web Speech | 新写：InnerAudioContext + 远程 TTS URL |
| `AppShell` 导航 | 小程序 tabBar 原生 | app.config.ts tabBar（学习/复习/词库/我的） |
| Onboarding 路由守卫 | 小程序页面栈机制 | 改为首页内首次引导层 |

## 9. 小程序技术方案比较

评估基准（PRD 给定）：稳定性 > 微信兼容性 > 代码复用 > 开发效率 > 维护成本。

先说一个关键事实：**真正可复用的代码（types/srs/answer/selectors/数据）全部是零框架依赖的纯 TS，三种方案复用率完全相同**。框架选择只影响 UI 层写法。

| 维度 | A. 微信原生 + TS | B. Taro 4 + React + TS | C. uni-app |
|---|---|---|---|
| 稳定性 | ★★★★★ 无编译层，新特性（Skyline 等）即时可用 | ★★★★ 成熟框架（京东开源、社区最大），编译层偶有兼容坑但可预期 | ★★★★ |
| 微信兼容性 | ★★★★★ 100% | ★★★★★（Taro 对微信支持是多端框架中最好的） | ★★★★ |
| 代码复用（逻辑层） | ★★★★★ | ★★★★★ | ★★★★★ |
| 代码复用（UI 层/心智） | ★★ 全新 WXML/WXSS 范式 | ★★★★★ React + hooks，与 Web 端同范式，组件模式可对照移植 | ★ 范式不匹配（**直接排除**：现有栈是 React，引入 Vue 栈违背复用原则） |
| 开发效率 | ★★★ | ★★★★★ | ★★★★ |
| 维护成本（单人） | ★★★ 两套范式来回切换 | ★★★★ | ★★★ |
| 风险点 | 无 | 需锁定 React 18（Web 是 19，**不能共用 node_modules，但逻辑模块无 React 依赖不受影响**）；Tailwind 需 weapp-tailwindcss | — |

**推荐：B. Taro 4 + React 18 + TypeScript。**

理由：① 稳定性差距非「明显」（PRD 的否决条件是「原生**明显**更稳定」，Taro 4 对微信小程序的兼容性久经验证，编译层风险可控可查）；② 复用的核心逻辑层三案等价，决定项落在 UI 层——Taro 让整个项目保持单一 React 心智，现有 FiveDLearn/AppShell 的交互实现可直接对照移植，长期单人维护成本最低；③ 排除 uni-app 的理由是硬性的（技术栈不匹配）。

**回退条件**（写明，避免沉没成本）：若 Phase 1 骨架阶段遇到 Taro 编译层无法绕过的微信兼容问题（如分包预下载、Skyline、虚拟支付组件调用异常），立即切换微信原生——损失仅限 UI 层，逻辑层与数据零损失。禁止 web-view 套壳（PRD 已禁止，本方案不涉及）。

## 10. Web + 小程序共享架构（推荐目标架构）

```
┌─────────────┐   ┌──────────────────┐
│ Web (Next16) │   │ 小程序 (Taro4+React18) │
│ 现有静态页面  │   │  学习/复习/词库/我的     │
│ + 未来登录页  │   │  微信登录/支付/缓存      │
└──────┬──────┘   └────────┬─────────┘
       │  HTTPS JSON API（同一套）  │
       ▼                        ▼
┌──────────────────────────────────────────┐
│ API 层：learn.xiyuzero.com/api/*（Vercel） │
│  ← 现有 repo 纯增量新增 app/api/ 路由        │
│  auth / units(分页) / srs / stats / orders │
│  import data/units.ts → 数据零迁移          │
└──────────────┬───────────────────────────┘
               ▼ 服务端连接（不受小程序域名备案限制）
┌──────────────────────────────────────────┐
│ Supabase Postgres（仅服务端访问，RLS 兜底）    │
└──────────────────────────────────────────┘
               ▲
┌──────────────┴───────────────────────────┐
│ 微信侧：code2Session / 虚拟支付 / 支付回调    │
└──────────────────────────────────────────┘
```

要点：
1. **API 与 Web 同域**（learn.xiyuzero.com）——小程序 request 合法域名要求 ICP 备案，`xiyuzero.com` 主域已部署国内可访问，需在 Phase 1 前确认备案状态（见风险 R3）。
2. **Supabase 仅作数据库**（服务端访问），不用其 Auth（不支持微信小程序登录）、不直连小程序（*.supabase.co 域名无备案，也不能配为合法域名）。
3. **词库不进数据库**：git 仓库静态文件是唯一真源，API 直接 import 提供分页/按需下发。不复制第二份 4505 卡，完全满足 PRD「不要两套数据」原则。后台改词 = 改 TSV → 构建脚本 → git push → Vercel 自动部署（现有管线，已验证）。
4. **学习状态以服务端为 Source of Truth**，小程序本地 wx.storage 仅作会话缓存 + 断网队列（满足 PRD §29 Offline）。

## 11. 数据库需要新增的表（全部为新建，无迁移风险）

```sql
users                -- id(uuid), email?, nickname, avatar, created_at
wechat_accounts      -- id, user_id→users, openid(unique), unionid?, created_at
user_identities      -- (预留) 未来 email/google/apple 绑定同一 user
review_states        -- user_id, unit_id, 首见/末复习/下次复习时间, review_count,
                     --   correct_count, production_*, production_days, interval,
                     --   status(learning/review/active/mastered), first_seen_at
                     --   PK(user_id, unit_id)；沿用现有 ReviewState 字段
favorites            -- user_id, unit_id, created_at
my_sentences         -- id, user_id, text, unit_ids[], created_at
daily_learning_stats -- user_id, date, new_learned, reviewed, listening, output,
                     --   recall_correct/total, listening_correct/total, minutes
                     --   UNIQUE(user_id, date)（把 DayActivity 服务端化）
user_settings        -- user_id, daily_new, target_level, voice_*, rate, goal
products             -- id, name, type(pro_30/pro_year/pro_forever),
                     --   duration_days, price(分), status(含 early_bird 开关)
membership_orders    -- id, user_id, product_id, platform(wechat/web),
                     --   amount, status(pending/paid/failed/refunded),
                     --   provider_order_id, created_at, paid_at
memberships          -- id, user_id, plan(free/pro), starts_at, expires_at,
                     --   source(wechat/web/admin)
analytics_events     -- id, user_id?, event, props(jsonb), created_at
streaks              -- 可由 daily_learning_stats 派生，或独立 current/best 字段
```

原则（PRD §36）：全部为 CREATE TABLE 新建，不碰任何现有数据（现有 Web 根本没有服务端数据）；后续变更一律走可回滚 migration。

## 12. 微信登录架构

```
wx.login() → code
  → POST /api/auth/wechat { code }
     → 服务端 code2Session(appid+secret) → openid/unionid   ← secret 只在服务端
     → upsert wechat_accounts(openid) → 关联/创建 users
     → 签发自建 JWT（短期 access + refresh，存 wx.storage）
  → 小程序带 JWT 调全部业务 API
```

- openid 只存 `wechat_accounts`，绝不作为业务 user_id（PRD §14 要求）
- unionid 用于将来主站公众号/小程序矩阵识别同一微信用户
- Web 绑定（Phase 5）：Web 端展示一次性绑定码 → 小程序「我的-账户绑定」输入 → 服务端把 wechat_account 挂到已有 user（或反向扫码），避免账号分裂

## 13. 支付架构（概要，详见未来 PAYMENT.md）

- 前置（**Phase 7 开工前的强制核查项**，以微信官方最新文档为准，不依据旧教程）：
  1. 小程序虚拟支付最新准入规则、类目资质、费率
  2. iOS 与 Android/HarmonyOS 差异（iOS 虚拟商品历来强制走微信虚拟支付通道，安卓走普通 JSAPI 支付）
  3. 教育学习类目在虚拟支付下的特殊要求
- 设计（满足 PRD §19-21）：
```
PaymentService（唯一入口，平台差异集中封装）
 ├─ createOrder(product) → 服务端建 pending 订单
 ├─ pay(order) → Android: wx.requestPayment / iOS: 虚拟支付 API
 ├─ verify() → 服务端主动查单 + 支付回调
 └─ activateMembership() → 仅当订单状态确认为 SUCCESS 才开通；幂等（唯一约束防重）
支付回调 /api/payment/notify：验签 → 订单 SUCCESS → memberships 开通（幂等键 provider_order_id）
```

## 14. 推荐项目目录结构

```
xiyuzero-miniprogram/               （Taro 4 + React 18 + TS，本 workspace）
├─ src/
│  ├─ app.config.ts                 tabBar: 学习/复习/词库/我的
│  ├─ pages/    index(学习) review library my
│  ├─ subpages/ learn-session/ 5d-card/ stats/ settings/ paywall/ bind/
│  ├─ components/  Button Card ProgressBar VocabularyCard CEFRBadge
│  │              StatCard Paywall Loading EmptyState ErrorState Modal Toast
│  ├─ services/  api.ts auth.ts srs-sync.ts payment.ts analytics.ts
│  ├─ repositories/  units.ts reviews.ts stats.ts（数据访问层）
│  ├─ hooks/     useSpeech(mini) useAuth useSyncQueue
│  ├─ utils/     request.ts storage.ts
│  └─ types/     ← 直接复用 web 的 types/index.ts（git submodule 或复制+同步脚本）
├─ shared → 引用 web 项目 lib/srs.ts lib/answer.ts lib/selectors.ts
└─ docs/      AUDIT MINIPROGRAM DATABASE PAYMENT SRS DEPLOYMENT
              WECHAT_REVIEW ENVIRONMENT TESTING README（PRD §42 十件套）
```

共享逻辑的三种落地方式（Phase 1 定案）：a) 抽 npm workspace 私有包；b) 复制+同步脚本；c) git submodule。推荐 a（monorepo 化）但需评估对现有 Web repo 的侵入——**保守起步用 b（复制+CI 校验一致性），Phase 5 后再抽包**，避免为「重构漂亮」动现有仓库。

## 15. 开发阶段（沿用 PRD Phase 0-10，标注范围修正）

| Phase | 内容 | 与 PRD 差异 |
|---|---|---|
| 0 | 本审计报告 | ✅ 完成 |
| 1 | 骨架：Taro 项目、tabBar、微信登录、API 跑通（auth + units 分页）、Supabase 建表 | **新增后端搭建**（原 PRD 假设已有） |
| 2 | 5D 学习引擎（Meaning→Sound→Grammar→Context→Output + Rating） | STEP 顺序按小程序 PRD 调整 |
| 3 | SRS 服务端化（review_states + 队列接口） | 算法直接复用 lib/srs.ts |
| 4 | 进度：CEFR 地图、统计、Streak、词库筛选搜索 | |
| 5 | 账号同步（Web 端需新增登录页——**Web 增量改造，不破坏静态站**） | 范围比 PRD 大（Web 侧） |
| 6 | 会员体系（Free 5 新词/天 / Pro 权限矩阵 / Paywall） | |
| 7 | 支付（先完成 §13 前置核查，再开发） | |
| 8 | Analytics（D1/D7、学习漏斗、付费漏斗） | |
| 9 | QA（PRD §40 全清单 + lint/typecheck/build） | |
| 10 | 微信审核与发布（类目、隐私保护指引、虚拟支付申报） | |

## 16. 主要风险（按严重度排序）

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | **无后端，需从零新建**（登录/SRS 服务端/订单/会员/Analytics 全部新建） | 范围比 PRD 预期大 | 本报告 §10-13 已给完整设计；Phase 1 一次搭好 |
| R2 | **4MB 词库进不了小程序包**（主包上限 2MB） | 首页不能加载全量数据 | API 按等级/会话分页下发 + wx.storage 分 key 缓存（单 key 1MB 上限，4505 条需切分存储）；学习 session 只拉当前 10-20 卡 |
| R3 | **request 合法域名需 ICP 备案**：若 xiyuzero.com 未备案，learn.xiyuzero.com 不能配为小程序合法域名 | API 无法直连 | Phase 1 前核查备案状态；未备案则需备案（周期数周）或用已备案域名+国内反代。**这是 Phase 1 的第一个检查项** |
| R4 | iOS 虚拟支付合规（教育类虚拟商品） | 审核被拒 / 无法上架收费 | Phase 7 前查最新官方规则；PaymentService 平台适配器；iOS 必要时先只开安卓支付 |
| R5 | Edge TTS 非官方接口 | 发音服务中断 | 已有三层兜底；小程序端再加静音降级；长期可评估腾讯云 TTS（境内稳定 + 合规） |
| R6 | Taro 编译层兼容问题 | 阻塞开发 | §9 回退条件：Phase 1 内验证不通过即切原生，逻辑层零损失 |
| R7 | Web 用户无账号，历史 LocalStorage 进度无法迁移到账号 | 用户预期管理 | Phase 5 提供「导入本地进度」一次性上传（Web 端读取 LocalStorage POST 到服务端） |
| R8 | 单人维护带宽（后端+小程序+支付+合规） | 交付周期 | 严格按 Phase 推进，MVP 范围见 §17 |
| R9 | 类目与资质：教育学习类小程序审核要求（工具类 vs 教育类、是否需要资质） | 审核被拒 | Phase 10 前以「教育-学习辅导/工具」类目申报并核实最新要求 |

## 17. 预计最小 MVP 范围

**包含**（PRD §41 验收 16 条中，MVP 覆盖 1-12、13 部分、16）：
微信登录 → 首页今日任务 → 5D 学习（5 步 + Output 评分）→ SRS 自动排程复习 → CEFR 进度 → 词库浏览/搜索 → 学习统计/错词/收藏 → Free 每日 5 新词限额 → 数据重进小程序不丢（服务端为准）。

**明确延后**：支付与 Pro 购买（Phase 7 独立交付，但权限矩阵/额度限制 Phase 6 先行，便于灰度）、Web 账号绑定（Phase 5）、听力专项页（Web 有，小程序 V2）、Starter 之外三个专项 Track、我的句子云同步（可 V1.5）。

**不做**（PRD §32 全清单照办）：AI 老师/社区/PK/排行榜/直播/积分商城/邀请裂变等。

---

## 附：审计方法说明

审计覆盖：package.json / next.config / vercel.json / tsconfig / 全部 11 个页面路由 / 4 个组件 / 3 个 lib 模块逐行阅读 / useSpeech / /api/tts 逐行 / types 逐行 / 数据文件统计（node 脚本精确计数）/ git 历史 20 commits / secrets 扫描（无 .env、无硬编码密钥，代码库干净）/ PROJECT.md、DEPLOY.md 交叉验证。

**下一步**：确认本报告（尤其是 §4 前提修正、§9 技术选型、§10 架构、R3 备案核查项）后，进入 Phase 1：先核查域名备案 → 搭建 Taro 骨架 + Supabase 表 + 登录闭环。
