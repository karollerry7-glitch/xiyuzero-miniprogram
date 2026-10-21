// ============================================================
// 证据记录动作层 — 证据与复习状态分离（spec §5/§9）
// 历史验证记录（xz_evidence）与 SRS 复习状态（xz_reviews_cache）分别保存。
// 本层是证据的唯一写入口；页面通过 peekExposure 在题目开始前冻结暴露时间。
// ============================================================

import {
  appendAttempt,
  deriveState,
  emptyChannelEvidence,
  expose,
  type AttemptRecord,
  type Channel,
  type ChannelEvidence,
  type DerivedState,
  type MasteryState,
  type UnitEvidence,
} from "../shared/evidence";
import { getEvidenceAll, setEvidenceAll } from "../utils/storage";

function unitEvidenceOf(unitId: string): UnitEvidence {
  return getEvidenceAll()[unitId] ?? {};
}

function channelOf(unitId: string, channel: Channel): ChannelEvidence {
  return unitEvidenceOf(unitId)[channel] ?? emptyChannelEvidence();
}

/** 题目开始前读取冻结暴露时间（延迟判定基准——
 *  本题中的提示揭示不影响本题的延迟判定，只影响下一次） */
export function peekExposure(unitId: string, channel: Channel): number {
  return channelOf(unitId, channel).lastExposureAt;
}

/** 记录教学/答案暴露：5D 卡展示、参考答案揭示后调用 */
export function markExposure(unitId: string, channel: Channel, at: number = Date.now()): void {
  const all = getEvidenceAll();
  const ev: UnitEvidence = all[unitId] ?? {};
  ev[channel] = expose(ev[channel], at);
  all[unitId] = ev;
  setEvidenceAll(all);
}

/** 记录一次作答（页面在提交时调用；independent 由提示揭示状态决定） */
export function recordAttempt(
  unitId: string,
  attempt: Omit<AttemptRecord, "ts"> & { ts?: number }
): void {
  const all = getEvidenceAll();
  const ev: UnitEvidence = all[unitId] ?? {};
  ev[attempt.channel] = appendAttempt(
    ev[attempt.channel],
    { ...attempt, ts: attempt.ts ?? Date.now() } as AttemptRecord
  );
  all[unitId] = ev;
  setEvidenceAll(all);
}

/** 查询某 unit 某通道的推导状态（展示用：延迟判定用当前冻结值） */
export function masteryOfChannel(
  unitId: string,
  channel: Channel,
  frozenExposureAt?: number
): DerivedState {
  const frozen = frozenExposureAt ?? peekExposure(unitId, channel);
  return deriveState(channelOf(unitId, channel), frozen);
}

/** 旧版「已掌握」（SRS status=mastered）在证据口径下缺少新标准证据：
 *  标注「历史记录，待补充验证」——不删除、不清零（spec §9 迁移兼容） */
export function historyMasteryNote(state: MasteryState): string | null {
  if (state === "exposed") return "历史学习记录，待补充验证";
  if (state === "recalled") return "能提取，跨日验证进行中";
  return null;
}
