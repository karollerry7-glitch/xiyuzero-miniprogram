// 星轨布局与统计纯函数 — 打卡页与分享海报共用同一套几何
// 坐标以「容器半宽」为单位（CSS 侧乘 rpx，Canvas 侧乘 px），
// 因此 5 词 / 10 词 / 20 词 / 30 词目标共用同一组件与海报逻辑。

import type { DayActivity } from "./types";

/** 五层轨道半径（占外环半径的比例）— Meaning / Sound / Grammar / Chunk / Context */
export const ORBIT_RING_FRACS = [0.4, 0.55, 0.7, 0.85, 1] as const;

/** 五层轨道的维度名（沿正上方自内向外排布） */
export const ORBIT_RING_LABELS = [
  "MEANING",
  "SOUND",
  "GRAMMAR",
  "CHUNK",
  "CONTEXT",
] as const;

/** 词星允许落位的轨道（第 2~4 环，最内环留给中央文案） */
const STAR_RING_FRACS = [0.55, 0.7, 0.85];

export interface OrbitStarPos {
  /** 弧度，-π/2 = 正上方 */
  angleRad: number;
  /** 落位轨道半径占外环比例 */
  radiusFrac: number;
}

/**
 * N 颗词星的落位：均分角度（避开正上方的轨道标签区，偏移半步），
 * 轨道按 i%3 轮转 + 微小确定性抖动，形成自然的星群而非机械圆环。
 * 纯确定性：同 N 每次结果一致（动画/海报/测试可复现）。
 */
export function orbitStars(n: number): OrbitStarPos[] {
  if (n <= 0) return [];
  const step = (Math.PI * 2) / n;
  const start = -Math.PI / 2 + step / 2;
  const out: OrbitStarPos[] = [];
  for (let i = 0; i < n; i++) {
    const jitter = ((i * 29 + 3) % 7 - 3) / 300; // -0.01 ~ +0.01
    out.push({
      angleRad: start + i * step,
      radiusFrac: STAR_RING_FRACS[i % 3] + jitter,
    });
  }
  return out;
}

/** 星点/颗粒的确定性伪随机（海报夜空颗粒、页面星尘共用） */
export function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // LCG（Numerical Recipes 参数），足够做视觉颗粒
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 本周一（ISO 周一为一周起点）至今的累计新词数 */
export function weekNewLearned(
  activity: Record<string, DayActivity>,
  now: Date = new Date()
): number {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const dow = (d.getUTCDay() + 6) % 7; // 周一=0
  d.setUTCDate(d.getUTCDate() - dow); // 本周一
  let sum = 0;
  for (let i = 0; i <= dow; i++) {
    const k = d.toISOString().slice(0, 10);
    sum += activity[k]?.newLearned ?? 0;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return sum;
}

/** "N PALABRAS" 的西语单复数（1 词时用单数） */
export function palabrasLabel(n: number): string {
  return n === 1 ? "PALABRA" : "PALABRAS";
}
