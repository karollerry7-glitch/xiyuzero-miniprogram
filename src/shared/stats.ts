// ============================================================
// 「我的」页统计 — 纯函数层（Phase 4）
// 全部基于既有数据（reviews / activity），不重写学习逻辑。
// 5D 五维掌握度的数据映射（文档化约定）：
//   D1 含义 Meaning：含义回忆（C→S）正确率；无分维度数据时回退总体 recall
//   D2 发音 Sound  ：听写正确率（listening）
//   D3 语法 Grammar：复习评分正确率（评分非 again 占比 — 语法应用的综合代理）
//   D4 词块 Chunk  ：词块回忆正确率；无分维度数据时回退总体 recall
//   D5 例句 Context：产出稳定度（productionDays ≥ 1 的已学词占比）
// ============================================================

import type { DayActivity, ReviewState } from "./types";

export interface DimensionStat {
  key: "meaning" | "sound" | "grammar" | "chunk" | "context";
  label: string;
  pct: number | null; // 0-100；null = 暂无数据
  samples: number; // 参与统计的样本数
}

function pct(correct: number, total: number): number | null {
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

/** 五维掌握度 */
export function dimensionMastery(
  reviews: Record<string, ReviewState>,
  activity: Record<string, DayActivity>
): DimensionStat[] {
  let meaningC = 0,
    meaningT = 0,
    chunkC = 0,
    chunkT = 0,
    listenC = 0,
    listenT = 0,
    recallC = 0,
    recallT = 0;

  for (const a of Object.values(activity)) {
    meaningC += a.meaningCorrect ?? 0;
    meaningT += a.meaningTotal ?? 0;
    chunkC += a.chunkCorrect ?? 0;
    chunkT += a.chunkTotal ?? 0;
    listenC += a.listeningCorrect;
    listenT += a.listeningTotal;
    recallC += a.recallCorrect;
    recallT += a.recallTotal;
  }

  // D3 语法：评分正确率（非 again 评分占比，跨所有已学词）
  let rateC = 0,
    rateT = 0;
  for (const r of Object.values(reviews)) {
    rateC += r.correctCount;
    rateT += r.correctCount + r.wrongCount;
  }

  // D5 例句：产出稳定度 = productionDays ≥ 1 的已学词占比
  const learned = Object.values(reviews).filter((r) => r.status !== "new");
  const stable = learned.filter((r) => (r.productionDays?.length ?? 0) > 0);

  return [
    {
      key: "meaning",
      label: "含义",
      pct: meaningT > 0 ? pct(meaningC, meaningT) : pct(recallC, recallT),
      samples: meaningT > 0 ? meaningT : recallT,
    },
    { key: "sound", label: "发音", pct: pct(listenC, listenT), samples: listenT },
    { key: "grammar", label: "语法", pct: pct(rateC, rateT), samples: rateT },
    {
      key: "chunk",
      label: "词块",
      pct: chunkT > 0 ? pct(chunkC, chunkT) : pct(recallC, recallT),
      samples: chunkT > 0 ? chunkT : recallT,
    },
    {
      key: "context",
      label: "例句",
      pct: learned.length > 0 ? Math.round((stable.length / learned.length) * 100) : null,
      samples: learned.length,
    },
  ];
}

/** 最近 N 天学习趋势（newLearned + reviewed 合计，与 Web recentActivity 一致） */
export function recentTrend(
  activity: Record<string, DayActivity>,
  days: number
): { date: string; total: number }[] {
  const out: { date: string; total: number }[] = [];
  const d = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(d.getDate() - i);
    const k = day.toISOString().slice(0, 10);
    const a = activity[k];
    out.push({
      date: k.slice(5), // MM-DD
      total: a ? a.newLearned + a.reviewed : 0,
    });
  }
  return out;
}

/** 汇总数字（我的页四宫格） */
export function mySummary(
  reviews: Record<string, ReviewState>,
  activity: Record<string, DayActivity>
) {
  const values = Object.values(reviews);
  const learned = values.filter((r) => r.status !== "new");
  const mastered = values.filter((r) => r.status === "mastered");
  const now = Date.now();
  const due = learned.filter((r) => new Date(r.dueDate).getTime() <= now);
  return {
    learnedTotal: learned.length,
    mastered: mastered.length,
    dueCount: due.length,
    // 连续天数复用 storage.streakDaysLocal 的语义，这里基于传入 activity 计算
    streak: streakFromActivity(activity),
    studyDays: Object.values(activity).filter(
      (a) => a.newLearned > 0 || a.reviewed > 0 || a.listening > 0 || a.output > 0
    ).length,
  };
}

/** 错词条目（错词本用） */
export interface WrongWordEntry {
  unitId: string;
  wrongCount: number;
  lastRatedAt: string; // ISO，可能为空字符串（旧数据）
}

/**
 * 错词本列表：wrongCount > 0 的词，按最近评分时间倒序（最近错的排前面）。
 * 无 lastRatedAt 的旧数据排最后。
 */
export function wrongWords(
  reviews: Record<string, ReviewState>
): WrongWordEntry[] {
  return Object.entries(reviews)
    .filter(([, r]) => r.wrongCount > 0)
    .map(([unitId, r]) => ({
      unitId,
      wrongCount: r.wrongCount,
      lastRatedAt: r.lastRatedAt ?? "",
    }))
    .sort((a, b) => (a.lastRatedAt < b.lastRatedAt ? 1 : -1));
}

/** 连续学习天数（与 storage.streakDaysLocal / Web selectors.streakDays 一致） */
export function streakFromActivity(
  activity: Record<string, DayActivity>,
  now: Date = new Date()
): number {
  let streak = 0;
  const d = new Date(now);
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    const a = activity[k];
    const did =
      a && (a.newLearned > 0 || a.reviewed > 0 || a.listening > 0 || a.output > 0);
    if (did) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (k === now.toISOString().slice(0, 10)) {
      // 今天还没学不算断签
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
