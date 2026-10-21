// ============================================================
// 证据与掌握判定（纯函数层）— Make It Stick 增量优化的核心
//
// 设计原则（对应产品 spec）：
// 1. 掌握状态由证据推导，不由"mastered=true"直接切换
// 2. 按技能通道分别计算（认词提取 / 听力 / 情境表达），不跨通道累计
// 3. 稳定可用（verified）MVP 起点：
//    - 同一义项 ≥3 次合格的无提示独立成功
//    - 其中 ≥2 次为延迟检索（距最近一次相关教学/答案暴露 ≥24h，暴露时间取题目开始前冻结值）
//    - 首次到末次合格记录跨度 ≥7 天
//    - 覆盖 ≥2 种情境（追问/迁移/复习场景算情境变化）
// 4. 同日重复最多贡献一次合格记录；看答案后的当次修正只算修正练习
// 5. 最新明确失败 → needsReview（需要复习），优先于旧累计达标；
//    解除需一次符合延迟条件的合格独立成功
// 6. transferred：verified 且含一次未原样练过的追问/迁移情境合格成功
//
// ⚠️ 次数与时间门槛是本项目可配置的设计起点，不是书中的科学阈值。
// ============================================================

import { dayKey } from "./datekey";

// ============ 类型 ============

export type Channel = "recognize" | "listen" | "produce";

export const CHANNELS: Channel[] = ["recognize", "listen", "produce"];

export const CHANNEL_LABEL: Record<Channel, string> = {
  recognize: "认词提取",
  listen: "听力",
  produce: "情境表达",
};

/** 单次作答记录（含评估条件） */
export interface AttemptRecord {
  ts: number;
  channel: Channel;
  /** 情境标识：base 原情境 / followup 追问 / transfer 迁移 / review 复习 */
  scenarioId: string;
  /** 是否独立（提交前未揭示任何提示/参考答案） */
  independent: boolean;
  /** 使用过的帮助类型：hint 词块提示 / subtitle 字幕 / answer 参考答案 */
  helpUsed: string[];
  /** 沟通结果：pass 交流成功 / fail 未通过 / needs_review 待复核 / null 未评估 */
  communication: "pass" | "fail" | "needs_review" | null;
  /** 目标表达结果：pass 恰当使用 / fail 证据不足 / none 本题不考察 / null 未评估 */
  targetForm: "pass" | "fail" | "none" | null;
  /** 是否为看答案/反馈后的当次修正（只算修正练习，不算独立证据） */
  revise: boolean;
  /** 题目开始前冻结的暴露时间（延迟判定基准；本题中的揭示不影响本题判定） */
  frozenExposureAt?: number;
}

/** 通道证据（按 unit × channel 分别保存） */
export interface ChannelEvidence {
  attempts: AttemptRecord[];
  /** 系统可观察的最近相关教学/答案暴露时间（ms）。延迟判定取题目开始前的冻结值 */
  lastExposureAt: number;
}

export type UnitEvidence = Partial<Record<Channel, ChannelEvidence>>;

/** 掌握状态（由证据推导） */
export type MasteryState = "none" | "exposed" | "recalled" | "verified" | "transferred";

export const MASTERY_LABEL: Record<MasteryState, string> = {
  none: "未评估",
  exposed: "已接触",
  recalled: "能独立提取",
  verified: "跨日已验证",
  transferred: "情境迁移可用",
};

// ============ 可配置门槛（设计起点，可按真实负荷迭代） ============

export interface MasteryConfig {
  /** 合格独立成功最少次数 */
  minQualifying: number;
  /** 其中延迟检索最少次数 */
  minDelayed: number;
  /** 延迟判定：距冻结暴露时间至少 24 小时 */
  delayMs: number;
  /** 首末合格记录最小跨度 */
  spanMs: number;
  /** 最少不同情境数 */
  minScenarios: number;
  /** 每通道保留的作答记录上限（防存储增长） */
  maxAttempts: number;
}

export const DEFAULT_MASTERY_CONFIG: MasteryConfig = {
  minQualifying: 3,
  minDelayed: 2,
  delayMs: 24 * 60 * 60 * 1000,
  spanMs: 7 * 24 * 60 * 60 * 1000,
  minScenarios: 2,
  maxAttempts: 20,
};

// ============ 纯函数 ============

export function emptyChannelEvidence(): ChannelEvidence {
  return { attempts: [], lastExposureAt: 0 };
}

/** 判定一次作答是否为「合格的独立成功」：
 *  独立（未用提示且非修正）+ 沟通成功（pass；待复核/失败均不算）+ 目标形式未被判定未达标 */
export function isQualifyingSuccess(a: AttemptRecord): boolean {
  if (!a.independent) return false;
  if (a.revise) return false;
  if (a.communication !== "pass") return false; // needs_review 不是成功证据
  if (a.targetForm === "fail") return false;
  return true;
}

/** 延迟检索判定：作答时间距「题目开始前冻结的暴露时间」≥ delayMs。
 *  跨过午夜不等于完成 24h 延迟——只看真实时间差。
 *  优先用记录内冻结值；缺失时回落参数（早期数据兼容） */
export function isDelayed(
  a: AttemptRecord,
  frozenExposureAt: number,
  cfg: MasteryConfig = DEFAULT_MASTERY_CONFIG
): boolean {
  const base = Math.max(a.frozenExposureAt ?? frozenExposureAt, 0);
  return a.ts - base >= cfg.delayMs;
}

/** 合格记录去重：同一自然日（东八区）最多计一次 */
function dedupeByDay(attempts: AttemptRecord[]): AttemptRecord[] {
  const seen = new Set<string>();
  const out: AttemptRecord[] = [];
  for (const a of attempts) {
    const k = dayKey(new Date(a.ts));
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

export interface DerivedState {
  state: MasteryState;
  /** 最新明确失败未解除 → 显示「需要复习」，优先于旧累计达标 */
  needsReview: boolean;
  qualifyingCount: number;
  delayedCount: number;
  scenarioCount: number;
  hasTransfer: boolean;
}

/** 由证据推导通道掌握状态（纯函数，可测） */
export function deriveState(
  ev: ChannelEvidence | undefined,
  frozenExposureAt: number,
  cfg: MasteryConfig = DEFAULT_MASTERY_CONFIG
): DerivedState {
  if (!ev || ev.attempts.length === 0) {
    // 无作答记录：看过 5D 卡（有教学暴露）→ 已接触；否则未评估
    const touched = Boolean(ev && ev.lastExposureAt > 0);
    return {
      state: touched ? "exposed" : "none",
      needsReview: false,
      qualifyingCount: 0,
      delayedCount: 0,
      scenarioCount: 0,
      hasTransfer: false,
    };
  }

  // 最新明确失败（沟通失败且非修正练习）之后，需一次符合延迟条件的合格独立成功才解除
  let lastFailIdx = -1;
  for (let i = ev.attempts.length - 1; i >= 0; i--) {
    const a = ev.attempts[i];
    if (!a.revise && a.communication === "fail") { lastFailIdx = i; break; }
  }
  let needsReview = false;
  if (lastFailIdx >= 0) {
    const resolved = ev.attempts
      .slice(lastFailIdx + 1)
      .some((a) => isQualifyingSuccess(a) && isDelayed(a, frozenExposureAt, cfg));
    needsReview = !resolved;
  }

  const qualifying = ev.attempts.filter(isQualifyingSuccess);
  const dedup = dedupeByDay(qualifying);
  const delayed = dedup.filter((a) => isDelayed(a, frozenExposureAt, cfg));
  const scenarios = new Set(dedup.map((a) => a.scenarioId));
  // 追问 / 迁移 / 复习场景算「未原样练过的情境变化」
  const hasTransfer = dedup.some((a) => a.scenarioId === "followup" || a.scenarioId === "transfer");

  let state: MasteryState = "exposed";
  if (dedup.length >= 1) state = "recalled";
  if (
    dedup.length >= cfg.minQualifying &&
    delayed.length >= cfg.minDelayed &&
    scenarios.size >= cfg.minScenarios &&
    dedup[dedup.length - 1].ts - dedup[0].ts >= cfg.spanMs
  ) {
    state = "verified";
    if (hasTransfer) state = "transferred";
  }

  return {
    state,
    needsReview,
    qualifyingCount: dedup.length,
    delayedCount: delayed.length,
    scenarioCount: scenarios.size,
    hasTransfer,
  };
}

/** 追加一次作答记录（不改变暴露时间——暴露由 revealHelp/expose 单独记账） */
export function appendAttempt(
  ev: ChannelEvidence | undefined,
  a: AttemptRecord,
  cfg: MasteryConfig = DEFAULT_MASTERY_CONFIG
): ChannelEvidence {
  const cur: ChannelEvidence = ev ?? emptyChannelEvidence();
  const attempts = [...cur.attempts, a].slice(-cfg.maxAttempts);
  return { ...cur, attempts };
}

/** 教学暴露 / 答案揭示：更新冻结基准（影响下一次的延迟判定） */
export function expose(ev: ChannelEvidence | undefined, at: number): ChannelEvidence {
  const cur: ChannelEvidence = ev ?? emptyChannelEvidence();
  return { ...cur, lastExposureAt: Math.max(cur.lastExposureAt, at) };
}

// ============ 多通道聚合展示 ============

export interface ChannelDisplay {
  channel: Channel;
  state: MasteryState;
  needsReview: boolean;
}

/** 一个 unit 的全通道展示（听/说/读/写口径：
 *  recognize+listen = 读·听理解证据，produce = 写作产出证据；
 *  口语（speaking）本产品无 ASR，恒为「未评估」——不冒充评估结果） */
export function displayOf(
  ev: UnitEvidence | undefined,
  frozenExposureAt: number,
  cfg: MasteryConfig = DEFAULT_MASTERY_CONFIG
): ChannelDisplay[] {
  return CHANNELS.map((ch) => {
    const d = deriveState(ev?.[ch], frozenExposureAt, cfg);
    return { channel: ch, state: d.state, needsReview: d.needsReview };
  });
}

/** 聚合统计：各状态 unit 数（我的页能力档案用） */
export function summarizeMastery(
  all: Record<string, UnitEvidence>,
  now: number = Date.now()
): Record<MasteryState, number> {
  const out: Record<MasteryState, number> = { none: 0, exposed: 0, recalled: 0, verified: 0, transferred: 0 };
  for (const ev of Object.values(all)) {
    // unit 级展示 = 各通道最高状态（展示「我能做什么」，不掩盖差异：细节在 unit 内按通道看）
    let best: MasteryState = "none";
    for (const ch of CHANNELS) {
      const d = deriveState(ev?.[ch], now);
      if (d.state === "none") continue;
      const rank: Record<MasteryState, number> = { none: 0, exposed: 1, recalled: 2, verified: 3, transferred: 4 };
      if (rank[d.state] > rank[best]) best = d.state;
    }
    out[best] += 1;
  }
  return out;
}
