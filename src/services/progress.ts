// 学习进度动作层 — Web 端 lib/store.ts Actions 的端内等价物
// 语义与 Web 完全一致（Phase 3 服务端化后替换为 API 提交 + 离线队列同步）
// 所有写操作同步追加离线事件队列（pushPendingEvent），供 Phase 3 补同步

import { initialReviewState, recordProduction, scheduleNext } from "../shared/srs";
import type { Rating, ReviewState } from "../shared/types";
import {
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

/** 四档评分（again/hard/good/easy）→ SRS 排程 */
export function rateUnit(unitId: string, rating: Rating): void {
  updateReview(unitId, (prev) => scheduleNext(prev, rating));
  bumpTodayActivity((d) => ({ ...d, reviewed: d.reviewed + 1 }));
  pushPendingEvent({ kind: "rate", unitId, payload: rating, ts: Date.now() });
}
