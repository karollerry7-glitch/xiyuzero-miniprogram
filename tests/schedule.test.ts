// 调度策略测试 — 复习压力控制 / 巩固队列排序 / 小测周期
import { test } from "node:test";
import * as assert from "node:assert/strict";
import "./helpers/setup.js";
import {
  reviewPressureBlocked,
  pickReviewFillIds,
  pickQuizIds,
  quizDue,
  REVIEW_PRESSURE_LIMIT,
  QUIZ_INTERVAL_DAYS,
} from "../src/services/schedule.js";
import type { ReviewState } from "../src/shared/types.js";

function rs(over: Partial<ReviewState>): ReviewState {
  return {
    status: "review",
    interval: 3,
    dueDate: new Date().toISOString(),
    correctCount: 2,
    wrongCount: 0,
    productionCorrect: 2,
    productionWrong: 0,
    productionDays: [],
    ...over,
  };
}

test("reviewPressureBlocked: 待复习 > 100 时拦截新词", () => {
  assert.equal(reviewPressureBlocked(REVIEW_PRESSURE_LIMIT), false);
  assert.equal(reviewPressureBlocked(REVIEW_PRESSURE_LIMIT + 1), true);
  assert.equal(reviewPressureBlocked(0), false);
});

test("pickReviewFillIds: 排除新词、未掌握优先、到期早优先", () => {
  const reviews: Record<string, ReviewState> = {
    // mastered 但最先到期 → 应排在 learning/review 之后
    m1: rs({ status: "mastered", dueDate: "2020-01-01T00:00:00Z" }),
    // learning 较晚到期 → 最优先（最脆弱）
    l1: rs({ status: "learning", dueDate: "2030-01-01T00:00:00Z" }),
    // review 中到期最早的
    r1: rs({ status: "review", dueDate: "2026-01-01T00:00:00Z" }),
    r2: rs({ status: "review", dueDate: "2027-01-01T00:00:00Z" }),
    // 新词永不进入巩固队列
    n1: rs({ status: "new" }),
  };
  const ids = pickReviewFillIds(reviews, 10);
  assert.deepEqual(ids, ["l1", "r1", "r2", "m1"]);
  // limit 生效
  assert.deepEqual(pickReviewFillIds(reviews, 2), ["l1", "r1"]);
});

test("pickQuizIds: 按到期时间升序抽样（遗忘临界优先）", () => {
  const reviews: Record<string, ReviewState> = {
    a: rs({ dueDate: "2027-01-01T00:00:00Z" }),
    b: rs({ dueDate: "2025-01-01T00:00:00Z" }),
    c: rs({ dueDate: "2026-01-01T00:00:00Z" }),
    n: rs({ status: "new" }),
  };
  assert.deepEqual(pickQuizIds(reviews, 2), ["b", "c"]);
});

test("quizDue: 3 天周期按东八区自然日计算", () => {
  // 从未测过 → 该测
  assert.equal(quizDue(null), true);
  assert.equal(quizDue(undefined), true);
  // 用真实 dayKey 推算 N 天前的日期键（避免测试在午夜边界抖动）
  const TZ = 8 * 3600 * 1000;
  const keyOf = (d: Date) =>
    new Date(d.getTime() + TZ).toISOString().slice(0, 10);
  const now = new Date();
  const daysAgo = (n: number) =>
    keyOf(new Date(now.getTime() - n * 86400000));
  assert.equal(quizDue(daysAgo(0)), false); // 今天测过
  assert.equal(quizDue(daysAgo(QUIZ_INTERVAL_DAYS - 1)), false); // 还没满
  assert.equal(quizDue(daysAgo(QUIZ_INTERVAL_DAYS)), true); // 满 3 天
  assert.equal(quizDue(daysAgo(30)), true);
});
