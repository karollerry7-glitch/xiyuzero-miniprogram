// 会员视图层逻辑测试 — 2026-10-22 收费会员移除后
// 覆盖：全员免费权益、历史 plan 字段兼容（isPro 仅展示）、额度恒不限、
//       全部等级可用、每日目标 = 用户自设、统计口径 newLearnedToday
import { test } from "node:test";
import { dayKey } from "../src/shared/datekey.js";
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

function view(
  plan: "free" | "pro" = "free",
  cycle: "monthly" | "yearly" | "lifetime" | null = null,
  proUntil: string | null = null,
  usage?: MembershipView["usage"]
): MembershipView {
  const isPro = computeIsPro(plan, cycle, proUntil);
  return {
    plan,
    billingCycle: cycle,
    proUntil,
    isPro,
    entitlements: entitlementsOf(isPro),
    usage: usage ?? null,
    fetchedAt: Date.now(),
  };
}

const DAY = 24 * 60 * 60 * 1000;
const today = dayKey();

// ---- 全员免费权益 ----
test("所有用户：完整权益（不限额度、全部等级、完整功能）", () => {
  const e = entitlementsOf(false);
  assert.equal(e.dailyNewLimit, null);
  assert.equal(e.levels, null);
  assert.equal(e.fullVocabulary, true);
  const ePro = entitlementsOf(true); // 历史 Pro 字段不再产生差异
  assert.deepEqual(ePro, e);
});

test("新词学习额度恒为不限（null）：Free 与历史 Pro 一致", () => {
  const free = view();
  const expiredPro = view("pro", "monthly", new Date(Date.now() - DAY).toISOString());
  assert.equal(remainingNewToday(free, 0), null);
  assert.equal(remainingNewToday(free, 999), null);
  assert.equal(remainingNewToday(expiredPro, 50), null);
});

test("全部等级可用（含 A2/B1/B2）", () => {
  const m = view();
  for (const lv of ["Starter", "A1", "A2", "B1", "B2"]) {
    assert.equal(levelAllowed(m, lv), true);
  }
});

test("每日目标 = 用户自设（不再被 Free 上限压缩）", () => {
  const m = view();
  assert.equal(effectiveDailyGoal(m, 20), 20);
  assert.equal(effectiveDailyGoal(m, 50), 50);
  assert.equal(effectiveDailyGoal(m, 3), 3);
});

// ---- 历史 plan 字段兼容（仅展示，不影响权益） ----
test("历史数据兼容：computeIsPro 仍按原规则计算展示字段", () => {
  assert.equal(computeIsPro("pro", "monthly", new Date(Date.now() + 30 * DAY).toISOString()), true);
  assert.equal(computeIsPro("pro", "monthly", new Date(Date.now() - DAY).toISOString()), false);
  assert.equal(computeIsPro("pro", "lifetime", null), true); // 存量终身用户
  assert.equal(computeIsPro("pro", null, null), false); // 异常数据安全默认
  assert.equal(computeIsPro("free", null, null), false);
});

test("过期 Pro 用户：isPro=false 仅是展示状态，权益不变", () => {
  const m = view("pro", "monthly", new Date(Date.now() - DAY).toISOString());
  assert.equal(m.isPro, false);
  assert.equal(m.entitlements.dailyNewLimit, null);
  assert.equal(remainingNewToday(m, 0), null);
  assert.equal(levelAllowed(m, "B2"), true);
});

// ---- 统计口径（原额度计算保留为统计） ----
test("今日已学统计：服务端用量与本地记账取大（防绕过口径保留）", () => {
  const m = view("free", null, null, { date: today, newLearnedToday: 0 });
  assert.equal(newLearnedToday(m, 10), 10); // 服务端没同步到 → 用本地
  const m2 = view("free", null, null, { date: today, newLearnedToday: 8 });
  assert.equal(newLearnedToday(m2, 3), 8); // 服务端更大 → 用服务端
});

test("防重置口径：服务端记录昨日数据不影响今日统计", () => {
  const yesterday = dayKey(new Date(Date.now() - DAY));
  const m = view("free", null, null, { date: yesterday, newLearnedToday: 5 });
  assert.equal(newLearnedToday(m, 0), 0);
});
