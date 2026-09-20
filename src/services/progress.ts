// 学习进度动作层 — Web 端 lib/store.ts Actions 的端内等价物
// 所有写操作同步追加离线事件队列（pushPendingEvent）+ 变更记账（bumpMutation），
// 由 services/sync.ts 在合适时机全量上传云端（LWW）。
// Phase 3：/api/progress 已上线，本层仍是唯一的本地写入口（离线优先）。

import { initialReviewState, recordProduction, scheduleNext } from "../shared/srs";
import type { Rating, ReviewState } from "../shared/types";
import {
  bumpMutation,
  bumpTodayActivity,
  getReviewsCache,
  pushPendingEvent,
  setReviewsCache,
} from "../utils/storage";

function updateReview(unitId: string, fn: (prev: ReviewState) => ReviewState): void {
  const reviews = getReviewsCache();
  const prev = reviews[unitId] ?? initialReviewState();
  reviews[unitId] = fn(prev);
  setReviewsCache(reviews);
  bumpMutation();
}

/** 开始学一个新词（5D 卡看完进入回忆时调用） */
export function markLearned(unitId: string): void {
  updateReview(unitId, (prev) => {
    if (prev.status !== "new") return prev;
    return {
      ...prev,
      status: "learning" as const,
      lastRatedAt: new Date().toISOString(),
    };
  });
  bumpTodayActivity((d) => ({ ...d, newLearned: d.newLearned + 1 }));
  pushPendingEvent({ kind: "learn", unitId, payload: null, ts: Date.now() });
}

/** 记录一次 Chinese → Spanish 主动回忆结果 */
export function recordRecallResult(
  unitId: string,
  result: "correct" | "close" | "wrong"
): void {
  updateReview(unitId, (prev) => recordProduction(prev, result));
  bumpTodayActivity((d) => ({
    ...d,
    recallTotal: d.recallTotal + 1,
    recallCorrect: d.recallCorrect + (result === "correct" ? 1 : 0),
    wrongIds:
      result === "wrong" && !d.wrongIds.includes(unitId)
        ? [...d.wrongIds, unitId]
        : d.wrongIds,
  }));
  pushPendingEvent({ kind: "recall", unitId, payload: result, ts: Date.now() });
}

/** 记录一次发音听写结果（复习页 sound 模式） */
export function recordListeningResult(unitId: string, ok: boolean): void {
  bumpTodayActivity((d) => ({
    ...d,
    listening: d.listening + 1,
    listeningTotal: d.listeningTotal + 1,
    listeningCorrect: d.listeningCorrect + (ok ? 1 : 0),
  }));
  bumpMutation();
  pushPendingEvent({ kind: "listen", unitId, payload: ok, ts: Date.now() });
}

/** 四档评分（again/hard/good/easy）→ SRS 排程 */
export function rateUnit(unitId: string, rating: Rating): void {
  updateReview(unitId, (prev) => scheduleNext(prev, rating));
  bumpTodayActivity((d) => ({ ...d, reviewed: d.reviewed + 1 }));
  pushPendingEvent({ kind: "rate", unitId, payload: rating, ts: Date.now() });
}
