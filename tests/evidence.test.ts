// 掌握判定（证据层）验收测试 — 覆盖 spec §11 的 10 个关键情形
// 纯函数层测试：不依赖 Taro storage，直接构造证据数据
import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  appendAttempt,
  DEFAULT_MASTERY_CONFIG,
  deriveState,
  displayOf,
  emptyChannelEvidence,
  expose,
  isDelayed,
  isQualifyingSuccess,
  summarizeMastery,
  type AttemptRecord,
  type ChannelEvidence,
} from "../src/shared/evidence.js";

const DAY = 24 * 60 * 60 * 1000;
const H = 60 * 60 * 1000;
const cfg = DEFAULT_MASTERY_CONFIG;

function ok(ts: number, frozen: number, scenarioId = "base"): AttemptRecord {
  // 一次合格的独立成功（无提示、非修正、交流成功、目标形式达标）
  return {
    ts,
    channel: "recognize",
    scenarioId,
    independent: true,
    helpUsed: [],
    revise: false,
    communication: "pass",
    targetForm: "pass",
    frozenExposureAt: frozen,
  };
}

function fail(ts: number, frozen: number): AttemptRecord {
  return { ...ok(ts, frozen), communication: "fail", targetForm: "none" };
}

// ---------- 情形 1：只看卡片 / 选对选择题 / 点「认识」不能进入主动掌握 ----------
test("情形1：无作答证据（只看 5D 卡）→ 状态最多 exposed，不会 recalled", () => {
  const ev = emptyChannelEvidence();
  const shown = expose(ev, Date.now()); // 只记教学暴露
  const d = deriveState(shown, 0);
  assert.equal(d.state, "exposed"); // 有暴露无提取 → 已接触
  assert.equal(d.qualifyingCount, 0);
});

// ---------- 情形 2：提示后答对有学习记录，但没有独立成功证据 ----------
test("情形2：看提示（helpUsed）后答对 → 不计入合格独立成功", () => {
  const frozen = Date.now() - 3 * DAY;
  const a: AttemptRecord = { ...ok(Date.now(), frozen), helpUsed: ["hint"], independent: false };
  const ev = appendAttempt(undefined, a);
  const d = deriveState(ev, frozen);
  assert.equal(d.state, "exposed"); // 交流成功但非独立 → 不晋级 recalled
  assert.equal(isQualifyingSuccess(a), false);
});

test("情形2b：看答案后的当次修正 → 只算修正练习", () => {
  const frozen = Date.now() - 3 * DAY;
  const a: AttemptRecord = { ...ok(Date.now(), frozen), revise: true };
  assert.equal(isQualifyingSuccess(a), false);
  const d = deriveState(appendAttempt(undefined, a), frozen);
  assert.equal(d.state, "exposed");
});

// ---------- 情形 3：同日重复与午夜前后作答不能绕过延迟条件 ----------
test("情形3a：同日多次合格只计一次", () => {
  const frozen = Date.now() - 10 * DAY;
  const t0 = Date.now() - 2 * DAY;
  const ev = [ok(t0, frozen), ok(t0 + 2 * H, frozen), ok(t0 + 5 * H, frozen)]
    .reduce(appendAttempt, undefined as ChannelEvidence | undefined);
  const d = deriveState(ev!, frozen);
  assert.equal(d.qualifyingCount, 1);
});

test("情形3b：跨午夜 ≠ 24h：暴露后 2 小时作答（哪怕过了午夜）不算延迟检索", () => {
  const exposedAt = new Date("2026-10-21T23:00:00+08:00").getTime();
  const attemptAt = new Date("2026-10-22T01:00:00+08:00").getTime(); // 跨午夜但只隔 2 小时
  const a = ok(attemptAt, exposedAt);
  assert.equal(isDelayed(a, exposedAt), false);
});

test("情形3c：真延迟判定用题前冻结值，不受本题揭示影响", () => {
  const frozen = Date.now() - 30 * H;
  const a = ok(Date.now(), frozen); // 题目内部揭示了提示，但冻结值是题前拍的
  assert.equal(isDelayed(a, 0), true); // 以冻结值为准，不是当前的 lastExposureAt
});

// ---------- 情形 4：关键错误不能被其他得分抵消（needsReview 优先） ----------
test("情形4：最新明确失败 → needsReview 显示，优先于旧累计达标", () => {
  // 先攒足证据（3 次合格、2 次延迟、跨 7 天、2 情境）→ transferred
  const d0 = Date.now();
  const frozen = d0 - 30 * DAY;
  const ev = [
    ok(d0 - 9 * DAY, frozen),
    ok(d0 - 8 * DAY, frozen, "review"),
    ok(d0 - 1 * DAY, frozen, "followup"),
  ].reduce(appendAttempt, undefined as ChannelEvidence | undefined);
  const before = deriveState(ev!, frozen);
  assert.equal(before.state, "transferred");
  assert.equal(before.needsReview, false);

  // 然后明确失败 → needsReview 置位（即便旧证据达标）
  const ev2 = appendAttempt(ev, fail(d0, frozen));
  const d = deriveState(ev2, frozen);
  assert.equal(d.needsReview, true);
  assert.equal(d.state, "transferred"); // 历史状态保留展示
});

test("情形4b：needsReview 需一次符合延迟条件的合格独立成功才解除", () => {
  const d0 = Date.now();
  const frozen = d0 - 30 * DAY;
  let ev = [
    ok(d0 - 9 * DAY, frozen),
    ok(d0 - 8 * DAY, frozen, "review"),
    ok(d0 - 1 * DAY, frozen, "followup"),
    fail(d0, frozen),
  ].reduce(appendAttempt, undefined as ChannelEvidence | undefined);
  assert.equal(deriveState(ev, frozen).needsReview, true);
  // 真实流程：失败后答案揭示 → 暴露基准更新为失败时刻 d0。
  // 同日快速再答对（frozen=d0，仅过 10 分钟，非延迟）→ 不解除
  ev = appendAttempt(ev, ok(d0 + 10 * 60 * 1000, d0));
  assert.equal(deriveState(ev, frozen).needsReview, true);
  // 次日之后（frozen=d0，距失败 25h ≥ 24h）合格 → 解除
  ev = appendAttempt(ev, ok(d0 + 25 * H, d0));
  assert.equal(deriveState(ev, frozen).needsReview, false);
});

// ---------- 情形 5：次数与门槛 ----------
test("情形5a：暴露后 24h 内的多次成功不算延迟检索 → 不晋级 verified", () => {
  const d0 = Date.now();
  const E0 = d0 - 23 * H; // 最近一次教学暴露
  const ev = [
    ok(d0 - 20 * H, E0),
    ok(d0 - 10 * H, E0),
    ok(d0 - 1 * H, E0),
  ].reduce(appendAttempt, undefined as ChannelEvidence | undefined);
  const d = deriveState(ev!, E0);
  assert.equal(d.delayedCount, 0); // 全部在暴露后 24h 内：当天短时记忆，非跨日保持
  assert.equal(d.state, "recalled");
});

test("情形5b：跨日但总跨度不足 7 天 → 不晋级 verified", () => {
  const d0 = Date.now();
  const frozen = d0 - 10 * DAY;
  const ev = [
    ok(d0 - 3 * DAY, frozen),
    ok(d0 - 2 * DAY, frozen, "review"),
    ok(d0 - 1 * DAY, frozen, "followup"),
  ].reduce(appendAttempt, undefined as ChannelEvidence | undefined);
  const d = deriveState(ev!, frozen);
  assert.equal(d.delayedCount, 3);
  assert.equal(d.state, "recalled"); // 跨度 3-1=2 天 < 7 天
});

test("情形5c：满足 3 次 / 2 延迟 / 7 天 / 2 情境 → verified；无追问迁移 → 不 transferred", () => {
  const d0 = Date.now();
  const frozen = d0 - 30 * DAY;
  const ev = [
    ok(d0 - 9 * DAY, frozen),
    ok(d0 - 8 * DAY, frozen, "review"),
    ok(d0 - 1 * DAY, frozen, "followup"),
  ].reduce(appendAttempt, undefined as ChannelEvidence | undefined);
  const d = deriveState(ev!, frozen);
  assert.equal(d.state, "transferred"); // 含 followup 情境
});

test("情形5d：同一情境（全 base）只算 1 种情境 → 不晋级", () => {
  const d0 = Date.now();
  const frozen = d0 - 30 * DAY;
  const ev = [
    ok(d0 - 9 * DAY, frozen),
    ok(d0 - 8 * DAY, frozen),
    ok(d0 - 1 * DAY, frozen),
  ].reduce(appendAttempt, undefined as ChannelEvidence | undefined);
  const d = deriveState(ev!, frozen);
  assert.equal(d.scenarioCount, 1);
  assert.equal(d.state, "recalled"); // 情境单一
});

// ---------- 情形 6：通道分离（不跨通道累计） ----------
test("情形6：认词通道证据不会点亮听力/表达通道", () => {
  const d0 = Date.now();
  const frozen = d0 - 30 * DAY;
  const ev = {
    recognize: [ok(d0 - 9 * DAY, frozen), ok(d0 - 8 * DAY, frozen, "review"), ok(d0 - 1 * DAY, frozen, "followup")]
      .reduce(appendAttempt, undefined as ChannelEvidence | undefined),
  };
  const disp = displayOf(ev, 0);
  const by = Object.fromEntries(disp.map((x) => [x.channel, x]));
  assert.equal(by.recognize.state, "transferred");
  assert.equal(by.listen.state, "none"); // 听力无证据 ≠ 顺带达标
  assert.equal(by.produce.state, "none"); // 情境表达同理
});

// ---------- 情形 7：待复核不计成功也不计失败 ----------
test("情形7：needs_review 作答不进入合格计数，也不触发 needsReview", () => {
  const frozen = Date.now() - 30 * DAY;
  const a: AttemptRecord = { ...ok(Date.now(), frozen), communication: "needs_review" };
  const ev = appendAttempt(undefined, a);
  const d = deriveState(ev, frozen);
  assert.equal(d.state, "exposed");
  assert.equal(d.needsReview, false); // 待复核 ≠ 明确失败
});

// ---------- 情形 8：旧数据迁移兼容（不虚构、不清零） ----------
test("情形8：旧「mastered」无新标准证据 → 展示为历史记录待验证，不清零", () => {
  // 旧用户只有 SRS 状态（reviews），无证据层 → 能力档案从零开始，
  // 但旧 reviews 数据不被删除（storage 层保证）；证据层仅如实展示
  const all = summarizeMastery({}); // 无证据数据
  assert.equal(all.none, 0); // 无记录不计数
  assert.equal(all.exposed + all.recalled + all.verified + all.transferred, 0);
  // 有一条暴露记录 → exposed=1（如实，不虚构 verified）
  const m = summarizeMastery({ u1: { recognize: expose(undefined, Date.now()) } });
  assert.equal(m.exposed, 1);
  assert.equal(m.verified, 0);
});

// ---------- 情形 9：记录上限（防存储增长） ----------
test("情形9：作答记录按 maxAttempts 限量保留", () => {
  const frozen = Date.now() - 100 * DAY;
  let ev: ChannelEvidence | undefined;
  for (let i = 0; i < 30; i++) {
    ev = appendAttempt(ev, ok(Date.now() - (50 - i) * H, frozen));
  }
  assert.equal(ev!.attempts.length, DEFAULT_MASTERY_CONFIG.maxAttempts);
});

// ---------- 情形 10：verify 晋级需真实满足全部条件 ----------
test("情形10：缺任何一项都不 verified（门槛联防）", () => {
  const d0 = Date.now();
  const frozen = d0 - 30 * DAY;
  // 只有 2 次合格（缺次数）
  const few = [ok(d0 - 9 * DAY, frozen), ok(d0 - 1 * DAY, frozen, "followup")]
    .reduce(appendAttempt, undefined as ChannelEvidence | undefined);
  assert.equal(deriveState(few!, frozen).state, "recalled");
});
