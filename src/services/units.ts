// 词库数据访问层 — API 客户端 + 本地缓存
// 性能原则（审计 R2）：4MB 词库不进小程序包，按需分页拉取

import { UnitsPage, UnitFull, UnitSummary } from "../shared/types";
import { request } from "./request";
import {
  getPrefs,
  getReviewsCache,
  getTodayActivity,
  streakDaysLocal,
} from "../utils/storage";

/** 词库浏览：分页 + 等级筛选 */
export async function fetchUnitsPage(
  level?: string,
  page = 1,
  pageSize = 50
): Promise<UnitsPage> {
  return request<UnitsPage>("/api/units", {
    query: { level, page, pageSize },
  });
}

/** 学习会话：按 id 批量取完整 5D 卡（每次 ≤ 20 张） */
export async function fetchUnitsByIds(ids: string[]): Promise<UnitFull[]> {
  if (!ids.length) return [];
  return request<UnitFull[]>("/api/units", {
    query: { ids: ids.join(",") },
  });
}

/** 词库搜索（服务端过滤） */
export async function searchUnits(
  q: string,
  level?: string,
  page = 1,
  pageSize = 50
): Promise<UnitsPage> {
  return request<UnitsPage>("/api/units", {
    query: { q, level, page, pageSize },
  });
}

// ============ 首页概览（今日任务） ============
// Phase 1 骨架版：本地缓存 + 词库首页拉取拼装
// Phase 3 SRS 服务端化后切换为 GET /api/today（单一接口）

export interface TodayOverview {
  newToday: number;
  dailyGoal: number;
  dueCount: number;
  streak: number;
  currentLevelPct: number;
  currentLevelName: string;
  learnedTotal: number;
}

export function localOverview(): TodayOverview {
  const reviews = getReviewsCache();
  const counts = Object.values(reviews).filter((r) => r.status !== "new").length;
  const today = getTodayActivity();
  const prefs = getPrefs();
  return {
    newToday: today.newLearned,
    dailyGoal: prefs.dailyNew,
    dueCount: Object.values(reviews).filter(
      (r) =>
        r.status !== "new" &&
        new Date(r.dueDate).getTime() <= Date.now()
    ).length,
    streak: streakDaysLocal(),
    currentLevelPct: 0,
    currentLevelName: prefs.startLevel,
    learnedTotal: counts,
  };
}

export type { UnitSummary, UnitFull };
