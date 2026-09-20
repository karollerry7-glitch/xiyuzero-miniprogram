// ============================================================
// 改编自 Web 端 xiyuzero-learn/lib/selectors.ts（2026-09-18 快照）
// 差异（结构性，逻辑零改动）：
//   1. units 不再 import 4MB 静态文件 → 作为参数传入（小程序由 API 按需获取）
//   2. todayKey 依赖 store → 参数化（调用方传入，默认本地生成）
// 小程序端数据策略：学习 session / 词库列表从 API 拉取后，
// 与本地缓存 reviews 合并计算（服务端为准，本地加速）。
// ============================================================

import { LearningUnit, ReviewState } from "./types";
import { initialReviewState, isDue } from "./srs";

export function getReviewOf(
  reviews: Record<string, ReviewState>,
  id: string
): ReviewState {
  return reviews[id] ?? initialReviewState();
}

// 等级顺序
const LEVEL_IDX: Record<string, number> = {
  Starter: 0,
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
};

export function todayKeyLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 今日新学习队列：未学习过的单元（从用户起始等级开始） */
export function newQueue(
  units: LearningUnit[],
  reviews: Record<string, ReviewState>,
  startLevel: string,
  limit?: number
): LearningUnit[] {
  const minIdx = LEVEL_IDX[startLevel] ?? 0;
  const out = units.filter((u) => {
    const r = reviews[u.id];
    if (r && r.status !== "new") return false;
    return (LEVEL_IDX[u.level] ?? 0) >= minIdx;
  });
  return limit ? out.slice(0, limit) : out;
}

/** 今日待复习：已学习且到期 */
export function dueQueue(
  units: LearningUnit[],
  reviews: Record<string, ReviewState>,
  limit?: number
): LearningUnit[] {
  const now = Date.now();
  const out = units.filter((u) => {
    const r = reviews[u.id];
    return r && r.status !== "new" && isDue(r, now);
  });
  return limit ? out.slice(0, limit) : out;
}

export function vocabularyCounts(reviews: Record<string, ReviewState>) {
  let active = 0;
  let passive = 0;
  let mastered = 0;
  for (const r of Object.values(reviews)) {
    if (r.status === "mastered") mastered++;
    else if (r.status === "active") active++;
    else if (r.status !== "new") passive++;
  }
  return { active, passive, mastered };
}

export function streakDays(
  activity: Record<string, { newLearned: number; reviewed: number; listening: number; output: number }>,
  todayKey: string = todayKeyLocal()
): number {
  let streak = 0;
  const d = new Date();
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    const a = activity[k];
    const did =
      a && (a.newLearned > 0 || a.reviewed > 0 || a.listening > 0 || a.output > 0);
    if (did) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (k === todayKey) {
      // 今天还没学不算断签
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/** Level 进度（基于传入词库的等级分布） */
export function levelProgress(
  units: Pick<LearningUnit, "id" | "level">[],
  reviews: Record<string, ReviewState>
) {
  const levels = ["Starter", "A1", "A2", "B1", "B2"] as const;
  return levels.map((lv) => {
    const inLevel = units.filter((u) => u.level === lv);
    const done = inLevel.filter(
      (u) => (reviews[u.id]?.status ?? "new") !== "new"
    ).length;
    return {
      level: lv,
      total: inLevel.length,
      done,
      pct: inLevel.length ? Math.round((done / inLevel.length) * 100) : 0,
    };
  });
}
