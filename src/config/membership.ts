// ============================================================
// 会员体系统一配置 — Free / Pro（Phase 4）
// ⚠️ 唯一真源：所有价格、每日学习额度、会员权益、词库边界
//    必须从本文件读取，禁止在任何页面硬编码。
// 服务端镜像：learn.xiyuzero.com/lib/membership.ts（修改时两端同步）
// ============================================================

/** Free 用户每日最多学习的新单词数 */
export const FREE_DAILY_NEW_WORD_LIMIT = 5;

/** Free 用户可开启新学习的等级（词库边界；复习/浏览不受限） */
export const FREE_LEVELS: readonly string[] = ["Starter", "A1"];

/** Free 等级词量（展示用，约数 = Starter 25 + A1 459） */
export const FREE_LEVEL_WORD_COUNT = 484;

/** Pro 月卡价格（元） */
export const PRO_MONTHLY_PRICE = 19.9;

/** Pro 年卡价格（元） */
export const PRO_YEARLY_PRICE = 128;

/** 年卡折算月价展示（128 / 12 ≈ 10.67） */
export const PRO_YEARLY_PER_MONTH_DISPLAY = "10.7";

/** 词库总量 */
export const TOTAL_UNITS = 4505;

// ============ 计费周期（数据模型层） ============
// lifetime 已在数据模型与 billingCycle 中预留；
// 第一版不在前端展示、不允许购买（仅 monthly / yearly 上架展示）。
export type BillingCycle = "monthly" | "yearly" | "lifetime";

export type Plan = "free" | "pro";

// ============ 权益定义 ============

export interface Entitlements {
  /** 每日新词学习上限；null = 不限 */
  dailyNewLimit: number | null;
  /** 可开启新学习的等级列表；null = 全部 */
  levels: readonly string[] | null;
  fullVocabulary: boolean;
  smartReview: "basic" | "full";
  stats: "basic" | "full";
  historyDays: number | null;
  cloudSync: "basic" | "full";
}

export const FREE_ENTITLEMENTS: Entitlements = {
  dailyNewLimit: FREE_DAILY_NEW_WORD_LIMIT,
  levels: FREE_LEVELS,
  fullVocabulary: false,
  smartReview: "basic",
  stats: "basic",
  historyDays: 7,
  cloudSync: "basic",
};

export const PRO_ENTITLEMENTS: Entitlements = {
  dailyNewLimit: null,
  levels: null,
  fullVocabulary: true,
  smartReview: "full",
  stats: "full",
  historyDays: null,
  cloudSync: "full",
};

// ============ 定价展示（会员页） ============

export interface PricingPlan {
  key: BillingCycle;
  name: string;
  price: number;
  perMonth: string | null; // 折算月价展示
  recommended: boolean;
  note: string;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    key: "yearly",
    name: "年卡",
    price: PRO_YEARLY_PRICE,
    perMonth: PRO_YEARLY_PER_MONTH_DISPLAY,
    recommended: true, // 年卡为默认推荐方案
    note: "折合每月约 ¥10.7",
  },
  {
    key: "monthly",
    name: "月卡",
    price: PRO_MONTHLY_PRICE,
    perMonth: null,
    recommended: false,
    note: "按月订阅，随时取消",
  },
];

/** Free / Pro 权益对比（会员页展示） */
export const PLAN_FEATURES: { label: string; free: string; pro: string }[] = [
  {
    label: "词库范围",
    free: `Starter + A1（${FREE_LEVEL_WORD_COUNT} 词）`,
    pro: `全部 ${TOTAL_UNITS} 词（A2 / B1 / B2 解锁）`,
  },
  {
    label: "每日新词",
    free: `最多 ${FREE_DAILY_NEW_WORD_LIMIT} 个`,
    pro: "不限",
  },
  {
    label: "5D 学习流程",
    free: "完整体验",
    pro: "完整体验",
  },
  { label: "智能复习", free: "基础", pro: "完整" },
  { label: "学习统计", free: "基础", pro: "完整五维统计" },
  { label: "学习历史", free: "最近 7 天", pro: "完整" },
  { label: "云端同步", free: "基础", pro: "完整" },
];
