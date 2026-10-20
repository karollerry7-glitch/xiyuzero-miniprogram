// 调度策略层 — 新词与复习的平衡（遗忘曲线应用）
// 规则（2026-10-20 需求）：
// 1) 待复习超过 REVIEW_PRESSURE_LIMIT 时，当日暂停新词：每日新词配额改由
//    已学旧词填充（未掌握优先），直到全部掌握为止
// 2) 每隔 QUIZ_INTERVAL_DAYS 天安排一次复习小测（检索练习），
//    从已学词中抽样作答，巩固临界遗忘的词

import type { ReviewState } from "../shared/types";
import { dayKey } from "../shared/datekey";
import { getLastQuizDate, setLastQuizDate } from "../utils/storage";

/** 待复习压力阈值：到期数超过该值时当日暂停新词 */
export const REVIEW_PRESSURE_LIMIT = 100;

/** 复习小测间隔（天）与规模 */
export const QUIZ_INTERVAL_DAYS = 3;
export const QUIZ_SIZE = 10;
/** 学过多少词后小测才开始出现（太少没意义） */
export const QUIZ_MIN_LEARNED = 10;

export function reviewPressureBlocked(dueCount: number): boolean {
  return dueCount > REVIEW_PRESSURE_LIMIT;
}

const STATUS_ORDER: Record<string, number> = { learning: 0, review: 1, mastered: 2 };

/**
 * 巩固队列：从已学词中挑 limit 个填当日新词配额。
 * 排序：未掌握优先（learning > review > mastered）→ 到期时间早优先 → 间隔短优先。
 * mastered 也参与（保持检索），但排在最后——「直到完全掌握为止」。
 */
export function pickReviewFillIds(
  reviews: Record<string, ReviewState>,
  limit: number
): string[] {
  return Object.entries(reviews)
    .filter(([, r]) => r.status !== "new")
    .sort(([, a], [, b]) => {
      const so = (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1);
      if (so !== 0) return so;
      const da =
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (da !== 0) return da;
      return a.interval - b.interval;
    })
    .slice(0, Math.max(0, limit))
    .map(([id]) => id);
}

/**
 * 小测队列：到期/最久未复习的词优先（遗忘曲线临界点，检索价值最高），
 * 随后按到期时间升序自然过渡到「即将到期」的词。
 */
export function pickQuizIds(
  reviews: Record<string, ReviewState>,
  size: number = QUIZ_SIZE
): string[] {
  return Object.entries(reviews)
    .filter(([, r]) => r.status !== "new")
    .sort(
      ([, a], [, b]) =>
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    )
    .slice(0, Math.max(0, size))
    .map(([id]) => id);
}

function dayKeyToUTC(k: string): number {
  const [y, m, d] = k.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 距上次小测是否已满间隔（东八区自然日差；从未测过 = 该测） */
export function quizDue(lastQuizDate: string | null | undefined): boolean {
  if (!lastQuizDate) return true;
  const diff = Math.floor(
    (dayKeyToUTC(dayKey()) - dayKeyToUTC(lastQuizDate)) / 86400000
  );
  return diff >= QUIZ_INTERVAL_DAYS;
}

/** 小测完成：记录今天（东八区），重置 3 天周期 */
export function markQuizDone(): void {
  setLastQuizDate(dayKey());
}
