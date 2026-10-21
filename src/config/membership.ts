// ============================================================
// 功能开放配置 — 2026-10-22 起移除收费会员
// 全部功能对所有用户免费开放（用户明确指示：去掉收费会员 Pro 版本）。
// 旧 Pro 数据记录保留（不删除用户数据），但不再产生任何权益差异。
// 服务端镜像：learn.xiyuzero.com/lib/membership.ts（修改时两端同步）
// ============================================================

/** 默认昵称（与服务端 lib/profile.ts DEFAULT_NICKNAME 保持一致） */
export const DEFAULT_NICKNAME = "西语学员";

/** 词库总量 */
export const TOTAL_UNITS = 4505;

// ============ 计费周期（历史数据兼容：旧记录仍带这些字段） ============

export type BillingCycle = "monthly" | "yearly" | "lifetime";

export type Plan = "free" | "pro";

// ============ 权益定义（全员一致，不再区分 Free/Pro） ============

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

/** 所有用户的权益（原 Pro 权益，现已免费） */
export const FULL_ENTITLEMENTS: Entitlements = {
  dailyNewLimit: null,
  levels: null,
  fullVocabulary: true,
  smartReview: "full",
  stats: "full",
  historyDays: null,
  cloudSync: "full",
};

// 兼容别名：旧代码引用处平滑过渡（值即全员权益）
export const FREE_ENTITLEMENTS = FULL_ENTITLEMENTS;
export const PRO_ENTITLEMENTS = FULL_ENTITLEMENTS;
