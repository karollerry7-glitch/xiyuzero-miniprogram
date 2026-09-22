// 会员 Entitlement 层逻辑测试
// 覆盖：Free 权限、Pro 权限模拟、会员过期降级、每日额度计算（防重置）、
//       等级边界、有效每日目标
import { test } from "node:test";
import * as assert from "node:assert/strict";
import "./helpers/setup.js";
import {
  computeIsPro,
  entitlementsOf,
  remainingNewToday,
  newLearnedToday,
  effectiveDailyGoal,
  levelAllowed,
  MembershipView,
} from "../src/services/membership.js";
import {
  FREE_DAILY_NEW_WORD_LIMIT,
  FREE_LEVELS,
  PRO_YEARLY_PRICE,
} from "../src/config/membership.js";

function freeView(usage?: MembershipView["usage"]): MembershipView {
  return {
    plan: "free",
    billingCycle: null,
    proUntil: null,
    isPro: false,
    entitlements: entitlementsOf(false),
    usage: usage ?? null,
    fetchedAt: Date.now(),
  };
}

function proView(cycle: "monthly" | "yearly" | "lifetime", proUntil: string | null): MembershipView {
  return {
    plan: "pro",
    billingCycle: cycle,
    proUntil,
    isPro: computeIsPro("pro", cycle, proUntil),
    entitlements: entitlementsOf(computeIsPro("pro", cycle, proUntil)),
    usage: null,
    fetchedAt: Date.now(),
  };
}

const DAY = 24 * 60 * 60 * 1000;
const today = new Date().toISOString().slice(0, 10);

// ---- 统一配置 ----
test("统一配置：Free 每日 10 词、年费价、等级边界", () => {
  assert.equal(FREE_DAILY_NEW_WORD_LIMIT, 10);
  assert.equal(PRO_YEARLY_PRICE, 29.9);
  assert.deepEqual(FREE_LEVELS, ["Starter", "A1"]);
});

// ---- 新用户（Free 默认视图）----
test("新用户默认 Free：额度 10，等级 Starter+A1", () => {
  const e = entitlementsOf(false);
  assert.equal(e.dailyNewLimit, 10);
  assert.deepEqual(e.levels, ["Starter", "A1"]);
  assert.equal(e.fullVocabulary, false);
});

test("新用户当天可学满 10 个新词", () => {
  const m = freeView({ date: today, newLearnedToday: 0 });
  assert.equal(remainingNewToday(m, 0), 10);
});

// ---- Free 学习额度 ----
test("Free 用户学习 3 个后剩 7", () => {
  const m = freeView({ date: today, newLearnedToday: 3 });
  assert.equal(remainingNewToday(m, 3), 7);
});

test("Free 用户学满 10 个后额度为 0（本地与服务端一致）", () => {
  const m = freeView({ date: today, newLearnedToday: 10 });
  assert.equal(remainingNewToday(m, 10), 0);
});

test("防绕过：断网本地学 10 个但服务端还不知道 → 仍按 10 计（取大者）", () => {
  const m = freeView({ date: today, newLearnedToday: 0 }); // 服务端没同步到
  assert.equal(newLearnedToday(m, 10), 10); // 取 max(0, 10)
  assert.equal(remainingNewToday(m, 10), 0);
});

test("防重置：服务端记录昨日数据不影响今日（日期规则）", () => {
  const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  const m = freeView({ date: yesterday, newLearnedToday: 5 }); // 昨天的用量
  // usage.date !== today → 服务端今日用量 0；本地今日 0 → 可学 10
  assert.equal(remainingNewToday(m, 0), 10);
});

test("重装后：本地清空，服务端记账仍在 → 额度不重置", () => {
  // 重装 = 本地 activity 0，但登录后服务端 usage = 10（来自云端进度）
  const m = freeView({ date: today, newLearnedToday: 10 });
  assert.equal(remainingNewToday(m, 0), 0); // 本地虽为 0，服务端记账优先
});

// ---- Pro 权限模拟 ----
test("Pro 月卡：不限每日额度、全部等级", () => {
  const m = proView("monthly", new Date(Date.now() + 30 * DAY).toISOString());
  assert.equal(m.isPro, true);
  assert.equal(remainingNewToday(m, 99), null); // 不限
  assert.equal(levelAllowed(m, "B2"), true);
  assert.equal(levelAllowed(m, "A2"), true);
});

test("Pro 年卡：同样解锁", () => {
  const m = proView("yearly", new Date(Date.now() + 365 * DAY).toISOString());
  assert.equal(m.isPro, true);
  assert.equal(m.entitlements.fullVocabulary, true);
  assert.equal(m.entitlements.dailyNewLimit, null);
});

// ---- 会员过期降级 ----
test("会员过期降级：proUntil 已过 → isPro=false，回 Free 额度", () => {
  const expired = new Date(Date.now() - DAY).toISOString();
  assert.equal(computeIsPro("pro", "monthly", expired), false);
  const m = proView("monthly", expired);
  assert.equal(m.isPro, false);
  assert.equal(m.entitlements.dailyNewLimit, 10);
  assert.equal(remainingNewToday(m, 0), 10);
});

test("临界点：proUntil 恰好为现在 → 已过期", () => {
  assert.equal(computeIsPro("pro", "monthly", new Date().toISOString()), false);
});

test("lifetime 预留：永不过期", () => {
  assert.equal(computeIsPro("pro", "lifetime", null), true);
});

test("异常数据：plan=pro 但无周期无期限 → 不算 Pro（安全默认）", () => {
  assert.equal(computeIsPro("pro", null, null), false);
});

// ---- Free 等级边界 ----
test("Free 用户：Starter/A1 允许，A2/B1/B2 拒绝", () => {
  const m = freeView();
  assert.equal(levelAllowed(m, "Starter"), true);
  assert.equal(levelAllowed(m, "A1"), true);
  assert.equal(levelAllowed(m, "A2"), false);
  assert.equal(levelAllowed(m, "B1"), false);
  assert.equal(levelAllowed(m, "B2"), false);
});

// ---- 每日目标 ----
test("首页每日目标：Free 被压到 10（即使 prefs=20）；Pro 用用户设置", () => {
  const free = freeView();
  assert.equal(effectiveDailyGoal(free, 20), 10);
  assert.equal(effectiveDailyGoal(free, 3), 3); // 用户设更小值尊重用户
  const pro = proView("yearly", new Date(Date.now() + 365 * DAY).toISOString());
  assert.equal(effectiveDailyGoal(pro, 20), 20);
});
