// 会员 Entitlement 层 — 客户端权限判断的唯一入口（Phase 4）
// 原则：
//   1. 页面不得自行判断 plan；一律通过本层
//   2. 每日额度以服务端上报的用量（UTC 日期规则，与 activity 记账一致）为准，
//      离线时回落到本地当日 activity —— 重装/退出页面不会重置额度
//      （本地 activity 会与云端 LWW 同步，登录后自动恢复）
//   3. 权益参数全部来自 config/membership.ts，不硬编码

import { request, ApiError } from "./request";
import {
  BillingCycle,
  Entitlements,
  FREE_ENTITLEMENTS,
  Plan,
  PRO_ENTITLEMENTS,
} from "../config/membership";
import { getMembershipCache, getToken, setMembershipCache } from "../utils/storage";

export interface MembershipUsage {
  date: string; // 服务端 UTC 日期（YYYY-MM-DD）
  newLearnedToday: number;
}

export interface MembershipView {
  plan: Plan;
  billingCycle: BillingCycle | null;
  proUntil: string | null;
  isPro: boolean; // plan=pro 且未过期
  entitlements: Entitlements;
  usage: MembershipUsage | null; // 服务端权威用量
  fetchedAt: number; // ms
}

/** Pro 是否仍有效（纯函数，可测） */
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

/** 由视图计算权益（纯函数，可测） */
export function entitlementsOf(isPro: boolean): Entitlements {
  return isPro ? PRO_ENTITLEMENTS : FREE_ENTITLEMENTS;
}

const DEFAULT_VIEW: MembershipView = {
  plan: "free",
  billingCycle: null,
  proUntil: null,
  isPro: false,
  entitlements: FREE_ENTITLEMENTS,
  usage: null,
  fetchedAt: 0,
};

/** 读取本地缓存的会员视图（无缓存 = Free 默认） */
export function getCachedMembership(): MembershipView {
  const cached = getMembershipCache();
  if (!cached) return DEFAULT_VIEW;
  // 过期状态实时重算（缓存里的 isPro 可能已失效）
  const isPro = computeIsPro(
    cached.plan,
    cached.billingCycle,
    cached.proUntil
  );
  return { ...cached, isPro, entitlements: entitlementsOf(isPro) };
}

/** 拉取服务端会员视图并缓存（登录后 / 进入学习会话前调用）。
 * 合规整改：游客（无 token）不发请求 —— 直接返回本地 Free 视图，
 * 避免无凭证请求 401 后触发自动重登、在用户不知情时建立账号。 */
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

// ============ 额度计算（纯函数，可测） ============
// 日期规则：全链路统一 UTC（activity 记账 todayKey 与服务端一致）

function todayKeyUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 今日已学新词数（防重置：取服务端用量与本地记账的较大值——
 * 本地未同步的学习也计入，避免"断网学 5 个→同步失败→再学 5 个"绕过额度）
 */
export function newLearnedToday(
  m: MembershipView,
  localTodayNewLearned: number,
  todayKey: string = todayKeyUTC()
): number {
  const serverCount =
    m.usage && m.usage.date === todayKey ? m.usage.newLearnedToday : 0;
  return Math.max(serverCount, localTodayNewLearned);
}

/** 今日还能学多少新词（Pro 返回 null = 不限） */
export function remainingNewToday(
  m: MembershipView,
  localTodayNewLearned: number,
  todayKey: string = todayKeyUTC()
): number | null {
  if (m.isPro) return null; // 不限
  const limit = m.entitlements.dailyNewLimit ?? 0;
  const used = newLearnedToday(m, localTodayNewLearned, todayKey);
  return Math.max(0, limit - used);
}

/** 首页/会话展示用的每日目标（Free 被限制在 5，即使 prefs.dailyNew 更大） */
export function effectiveDailyGoal(m: MembershipView, prefsDailyNew: number): number {
  if (m.isPro) return prefsDailyNew;
  return Math.min(
    m.entitlements.dailyNewLimit ?? prefsDailyNew,
    prefsDailyNew
  );
}

/** Free 用户新词学习是否允许从该等级开始（词库边界） */
export function levelAllowed(m: MembershipView, level: string): boolean {
  if (m.isPro || m.entitlements.levels === null) return true;
  return m.entitlements.levels.includes(level);
}

// ============ 购买流程（服务端 501 = 支付未开放） ============
export interface PayParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: "RSA";
  paySign: string;
}

export interface OrderCreateResult {
  orderId: string;
  payParams: PayParams;
}

export interface OrderStatusResult {
  orderId: string;
  status: "created" | "paid" | "closed";
  billingCycle: BillingCycle | null;
  amountCents: number;
  paidAt: number | null;
  createdAt: number;
}

/** 服务端未配置商户号（第一版）时抛出 */
export class PaymentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentUnavailableError";
  }
}

/** 创建订单：服务端统一定价，返回 wx.requestPayment 所需参数 */
export async function createOrder(
  cycle: BillingCycle
): Promise<OrderCreateResult> {
  try {
    return await request<OrderCreateResult>("/api/orders", {
      method: "POST",
      data: { billingCycle: cycle },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 501) {
      throw new PaymentUnavailableError(
        (e as ApiError).message || "支付功能尚未开放"
      );
    }
    throw e;
  }
}

/** 查询订单状态（支付后轮询；服务端会向微信兜底查单） */
export async function queryOrder(orderId: string): Promise<OrderStatusResult> {
  return request<OrderStatusResult>(
    `/api/orders/${encodeURIComponent(orderId)}`
  );
}

// ============ 兑换码激活（售卖：客服收款 ¥29.9/年 → 发码 → 激活年费 Pro） ============

export interface RedeemResult {
  ok: boolean;
  plan: Plan;
  billingCycle: BillingCycle | null;
  proUntil: string | null;
}

/**
 * 兑换码激活 Pro（POST /api/redeem）。
 * 失败（码无效/已用/未登录）时抛 ApiError，message 为可直接展示的中文提示。
 */
export async function redeemCode(code: string): Promise<RedeemResult> {
  const res = await request<RedeemResult>("/api/redeem", {
    method: "POST",
    data: { code },
  });
  // 激活成功后立即刷新本地缓存（服务端可能尚未拉取最新视图）
  try {
    await fetchMembership();
  } catch {
    /* 缓存刷新失败不影响激活结果 */
  }
  return res;
}
