// 学习统计逻辑测试（我的页）
// 覆盖：五维掌握度、连续天数、7 天趋势、汇总数字
import { test } from "node:test";
import * as assert from "node:assert/strict";
import "./helpers/setup.js";
import {
  dimensionMastery,
  mySummary,
  recentTrend,
  streakFromActivity,
} from "../src/shared/stats.js";
import { initialReviewState, scheduleNext } from "../src/shared/srs.js";
import type { DayActivity, ReviewState } from "../src/shared/types.js";

const DAY = 24 * 60 * 60 * 1000;

function day(partial: Partial<DayActivity>): DayActivity {
  return {
    newLearned: 0,
    reviewed: 0,
    listening: 0,
    output: 0,
    recallCorrect: 0,
    recallTotal: 0,
    listeningCorrect: 0,
    listeningTotal: 0,
    wrongIds: [],
    ...partial,
  };
}

function todayKey(offsetDays = 0): string {
  return new Date(Date.now() - offsetDays * DAY).toISOString().slice(0, 10);
}

// ---- 空数据（新用户）----
test("新用户：五维全部无数据（—），汇总为 0", () => {
  const dims = dimensionMastery({}, {});
  assert.equal(dims.length, 5);
  for (const d of dims) assert.equal(d.pct, null);

  const s = mySummary({}, {});
  assert.equal(s.learnedTotal, 0);
  assert.equal(s.mastered, 0);
  assert.equal(s.dueCount, 0);
  assert.equal(s.streak, 0);
});

// ---- 五维掌握度 ----
test("五维掌握度：含义/发音/语法/词块/例句各有数据源", () => {
  const activity: Record<string, DayActivity> = {
    [todayKey(1)]: day({
      meaningCorrect: 4,
      meaningTotal: 5, // 含义回忆 80%
      chunkCorrect: 1,
      chunkTotal: 4, // 词块 25%
      listeningCorrect: 3,
      listeningTotal: 4, // 发音 75%
    }),
  };
  const reviews: Record<string, ReviewState> = {
    "a1-001": {
      ...initialReviewState(),
      status: "learning",
      correctCount: 3,
      wrongCount: 1, // 语法（评分）75%
      productionDays: ["2026-09-19"], // 例句稳定产出
    },
    "a1-002": {
      ...initialReviewState(),
      status: "learning",
      correctCount: 2,
      wrongCount: 0,
      productionDays: [],
    },
  };
  const dims = dimensionMastery(reviews, activity);
  const by = Object.fromEntries(dims.map((d) => [d.key, d]));

  assert.equal(by.meaning.pct, 80); // 4/5
  assert.equal(by.sound.pct, 75); // 3/4
  assert.equal(by.grammar.pct, 83); // (3+2)/(4+2) = 5/6
  assert.equal(by.chunk.pct, 25); // 1/4
  assert.equal(by.context.pct, 50); // 1/2 learned 有 productionDays
});

test("五维回退：无分维度数据时用总体 recall（兼容旧数据）", () => {
  const activity: Record<string, DayActivity> = {
    [todayKey(0)]: day({ recallCorrect: 2, recallTotal: 4 }), // 总体 50%
  };
  const dims = dimensionMastery({}, activity);
  const by = Object.fromEntries(dims.map((d) => [d.key, d]));
  assert.equal(by.meaning.pct, 50);
  assert.equal(by.chunk.pct, 50);
});

// ---- 连续天数 ----
test("连续天数：昨天+今天都学 = 2；今天没学不算断签", () => {
  const a: Record<string, DayActivity> = {
    [todayKey(0)]: day({ newLearned: 5 }),
    [todayKey(1)]: day({ reviewed: 3 }),
  };
  assert.equal(streakFromActivity(a), 2);
});

test("连续天数：前天学、昨天没学 → 断签为 0", () => {
  const a: Record<string, DayActivity> = {
    [todayKey(2)]: day({ newLearned: 5 }),
  };
  assert.equal(streakFromActivity(a), 0);
});

test("连续天数：今天没学，但昨天学了 → 1（不算断签）", () => {
  const a: Record<string, DayActivity> = {
    [todayKey(1)]: day({ listening: 2 }),
  };
  assert.equal(streakFromActivity(a), 1);
});

// ---- 7 天趋势 ----
test("7 天趋势：7 个数据点，含今日", () => {
  const a: Record<string, DayActivity> = {
    [todayKey(0)]: day({ newLearned: 5, reviewed: 3 }), // total 8
    [todayKey(3)]: day({ newLearned: 1 }),
  };
  const trend = recentTrend(a, 7);
  assert.equal(trend.length, 7);
  const todayEntry = trend.find((t) => t.date === todayKey(0).slice(5));
  assert.ok(todayEntry);
  assert.equal(todayEntry!.total, 8);
  assert.equal(trend[6].total, 8); // 最后一列是今天
});

// ---- 汇总 ----
test("汇总：已学/已掌握/待复习计数", () => {
  const now = new Date();
  const reviews: Record<string, ReviewState> = {
    "a1-001": {
      ...initialReviewState(),
      status: "mastered",
      dueDate: new Date(now.getTime() + 30 * DAY).toISOString(), // 已掌握：未到期
    },
    "a1-002": {
      ...initialReviewState(),
      status: "review",
      dueDate: new Date(now.getTime() - DAY).toISOString(), // 已到期
    },
    "a1-003": {
      ...initialReviewState(),
      status: "review",
      dueDate: new Date(now.getTime() + 3 * DAY).toISOString(), // 未到期
    },
    "a1-004": { ...initialReviewState(), status: "new" }, // 不算已学
  };
  const s = mySummary(reviews, {});
  assert.equal(s.learnedTotal, 3); // 非 new
  assert.equal(s.mastered, 1);
  assert.equal(s.dueCount, 1); // 只有 a1-002 到期
});

// ---- SRS 快速回归 ----
test("SRS：good 首评 3 天 / again 10 分钟 / easy 7 天", () => {
  const good = scheduleNext(initialReviewState(), "good");
  assert.equal(good.interval, 3);
  assert.equal(good.status, "learning");

  const again = scheduleNext(initialReviewState(), "again");
  assert.ok(again.interval < 0.01); // 10 分钟（以天计）

  const easy = scheduleNext(initialReviewState(), "easy");
  assert.equal(easy.interval, 7);
});

test("SRS：错误率高时间隔增长放慢（penalty 0.8）", () => {
  let r: ReviewState = { ...initialReviewState(), interval: 10, status: "review" };
  // 制造高错误率：3 错 1 对
  r = { ...r, correctCount: 1, wrongCount: 3 };
  const next = scheduleNext(r, "good");
  // 10 * 2.5 * 0.8 = 20（无 penalty 会是 25）
  assert.equal(next.interval, 20);
});
