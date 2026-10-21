// 会员视图层 — 2026-10-22 起移除收费会员
// 服务端仍返回用户历史 plan 数据（不删除），但权益已无差异：
// 所有用户 = 全部功能免费。本层保留最小接口（视图缓存 + 兼容函数），
// 购买/兑换流程已下线；页面不得再出现付费引导。

import { request } from "./request";
import { BillingCycle, Entitlements, FULL_ENTITLEMENTS, Plan } from "../config/membership";
import { getMembershipCache, getToken, setMembershipCache } from "../utils/storage";

export interface MembershipUsage {
  date: string; // 服务端日期（YYYY-MM-DD，东八区）
  newLearnedToday: number;
}

export interface MembershipView {
  plan: Plan;
  billingCycle: BillingCycle | null;
  proUntil: string | null;
  /** 历史字段：仅供展示旧记录；不再控制任何权益 */
  isPro: boolean;
  entitlements: Entitlements;
  usage: MembershipUsage | null;
  fetchedAt: number; // ms
}

/** 历史记录兼容（纯函数，可测）：plan 字段不再影响权益 */
export function computeIsPro(
  plan: Plan,
  billingCycle: BillingCycle | null,
  proUntil: string | null,
  now: number = Date.now()
): boolean {
  if (plan !== "pro") return false;
  if (billingCycle === "lifetime") return true;
  if (!proUntil) return false;
  return new Date(proUntil).getTime() > now;
}

/** 权益恒为全员免费（原 Pro 权益） */
export function entitlementsOf(_isPro: boolean): Entitlements {
  void _isPro;
  return FULL_ENTITLEMENTS;
}

const DEFAULT_VIEW: MembershipView = {
  plan: "free",
  billingCycle: null,
  proUntil: null,
  isPro: false,
  entitlements: FULL_ENTITLEMENTS,
  usage: null,
  fetchedAt: 0,
};

/** 读取本地缓存视图（无缓存 = 默认） */
export function getCachedMembership(): MembershipView {
  const cached = getMembershipCache();
  if (!cached) return DEFAULT_VIEW;
  const isPro = computeIsPro(
    cached.plan,
    cached.billingCycle,
    cached.proUntil
  );
  return { ...cached, isPro, entitlements: entitlementsOf(isPro) };
}

/** 拉取服务端视图并缓存（保留：服务端 usage 用于跨设备统计展示）。
 * 合规整改：游客（无 token）不发请求。 */
export async function fetchMembership(): Promise<MembershipView> {
  if (!getToken()) return getCachedMembership();
  const server = await request<{
    plan: Plan;
    billingCycle: BillingCycle | null;
    proUntil: string | null;
    usage: MembershipUsage;
  }>("/api/membership");

  const isPro = computeIsPro(server.plan, server.billingCycle, server.proUntil);
  const view: MembershipView = {
    plan: server.plan,
    billingCycle: server.billingCycle,
    proUntil: server.proUntil,
    isPro,
    entitlements: entitlementsOf(isPro),
    usage: server.usage ?? null,
    fetchedAt: Date.now(),
  };
  setMembershipCache({
    plan: view.plan,
    billingCycle: view.billingCycle,
    proUntil: view.proUntil,
    usage: view.usage,
    fetchedAt: view.fetchedAt,
  });
  return view;
}

// ============ 额度计算（纯函数，向后兼容旧调用方） ============
// 功能已全部免费：新词学习不再有权益上限，只受用户自设每日目标约束。

import { dayKey } from "../shared/datekey";

/** 今日已学新词数（服务端用量与本地记账取大：统计口径，不再是额度） */
export function newLearnedToday(
  m: MembershipView,
  localTodayNewLearned: number,
  todayKey: string = dayKey()
): number {
  const serverCount =
    m.usage && m.usage.date === todayKey ? m.usage.newLearnedToday : 0;
  return Math.max(serverCount, localTodayNewLearned);
}

/** 今日还能学多少新词 —— 恒为 null（不限） */
export function remainingNewToday(
  _m: MembershipView,
  _localTodayNewLearned: number,
  _todayKey?: string
): number | null {
  return null;
}

/** 每日目标 = 用户自设（功能免费，不再压缩） */
export function effectiveDailyGoal(_m: MembershipView, prefsDailyNew: number): number {
  return prefsDailyNew;
}

/** 全部等级均可用 */
export function levelAllowed(_m: MembershipView, _level: string): boolean {
  return true;
}
