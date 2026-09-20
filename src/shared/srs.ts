// ============================================================
// 复用自 Web 端 xiyuzero-learn/lib/srs.ts（2026-09-18 快照）
// 仅改 import 路径（@/types → ./types），算法零改动
// ============================================================

import { Rating, ReviewState } from "./types";

// 简单可靠的 SRS 引擎，独立模块，未来可替换为 FSRS。
// 初始间隔参考：Again 10 分钟 / Hard 1 天 / Good 3 天 / Easy 7 天
// 之后按 1 → 3 → 7 → 14 → 30 → 60 → 120 天序列扩大，并根据错误率动态调整。

const MIN = 1 / (24 * 6); // 10 分钟（以天为单位）

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function initialReviewState(): ReviewState {
  return {
    status: "new",
    interval: 0,
    dueDate: new Date().toISOString(),
    correctCount: 0,
    wrongCount: 0,
    productionCorrect: 0,
    productionWrong: 0,
    productionDays: [],
  };
}

export function scheduleNext(prev: ReviewState, rating: Rating): ReviewState {
  const now = Date.now();
  const cur = prev.interval;
  let interval: number;

  const errorRate =
    prev.correctCount + prev.wrongCount > 0
      ? prev.wrongCount / (prev.correctCount + prev.wrongCount)
      : 0;
  const penalty = errorRate > 0.35 ? 0.8 : 1; // 错误率高则放慢间隔增长

  switch (rating) {
    case "again":
      interval = MIN;
      break;
    case "hard":
      interval = cur <= 0 ? 1 : Math.max(1, Math.round(cur * 1.2 * penalty));
      break;
    case "good":
      interval = cur <= 0 ? 3 : Math.round(Math.min(cur * 2.5 * penalty, 120));
      break;
    case "easy":
      interval = cur <= 0 ? 7 : Math.round(Math.min(cur * 3.5 * penalty, 180));
      break;
  }

  const due = new Date(now + interval * 24 * 60 * 60 * 1000);

  const next: ReviewState = {
    ...prev,
    interval,
    dueDate: due.toISOString(),
    lastRatedAt: new Date(now).toISOString(),
    correctCount: prev.correctCount + (rating === "again" ? 0 : 1),
    wrongCount: prev.wrongCount + (rating === "again" ? 1 : 0),
    status:
      rating === "again"
        ? prev.status === "new"
          ? "learning"
          : prev.status
        : prev.status === "new"
          ? "learning"
          : "review",
  };
  return next;
}

// 记录一次 Chinese → Spanish 主动回忆结果，更新 Active / Mastered 判定
export function recordProduction(
  state: ReviewState,
  result: "correct" | "close" | "wrong"
): ReviewState {
  const next = { ...state, productionDays: [...state.productionDays] };
  if (result === "wrong") {
    next.productionWrong = state.productionWrong + 1;
  } else {
    next.productionCorrect = state.productionCorrect + 1;
    const d = todayStr();
    if (!next.productionDays.includes(d)) next.productionDays.push(d);
  }
  // Active：Chinese → Spanish 至少 2 次正确
  if (next.productionCorrect >= 2 && next.status !== "mastered") {
    next.status = "active";
  }
  // Mastered：多日期（>=3 个不同日期）+ 主动回忆 >=4 次正确 + 间隔 >= 14 天
  if (
    next.productionDays.length >= 3 &&
    next.productionCorrect >= 4 &&
    next.interval >= 14
  ) {
    next.status = "mastered";
  }
  return next;
}

export function isDue(state: ReviewState, now = Date.now()): boolean {
  return new Date(state.dueDate).getTime() <= now;
}

export function dueLabel(state: ReviewState): string {
  const t = new Date(state.dueDate).getTime() - Date.now();
  if (t <= 0) return "现在";
  const days = Math.floor(t / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} 天后`;
  const hours = Math.floor(t / (60 * 60 * 1000));
  if (hours >= 1) return `${hours} 小时后`;
  return `${Math.max(1, Math.floor(t / 60000))} 分钟后`;
}
