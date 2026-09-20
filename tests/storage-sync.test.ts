// 存储持久化 + 学习进度保存 + App 重启恢复 + 云端恢复 + 无网络 测试
import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  setRequestHandler,
  simulateReinstall,
  peekStorage,
} from "./helpers/setup.js";
import "./helpers/setup.js";
import {
  markLearned,
  rateUnit,
  recordRecallResult,
} from "../src/services/progress.js";
import {
  getActivity,
  getPrefs,
  getReviewsCache,
  getTodayActivity,
  getToken,
  setToken,
  streakDaysLocal,
} from "../src/utils/storage.js";
import { syncNow } from "../src/services/sync.js";
import type { DayActivity, ReviewState } from "../src/shared/types.js";

const today = new Date().toISOString().slice(0, 10);

// ---- 学习进度保存 ----
test("学习进度保存：markLearned → 本地 reviews + 今日活动记账", () => {
  markLearned("a1-001");
  const reviews = getReviewsCache();
  assert.equal(reviews["a1-001"].status, "learning");

  const t = getTodayActivity();
  assert.equal(t.newLearned, 1);

  // 五维记账：含义回忆
  recordRecallResult("a1-001", "correct", "meaning");
  assert.equal(getTodayActivity().meaningCorrect, 1);
  assert.equal(getTodayActivity().meaningTotal, 1);
});

test("复习评分：rateUnit good → interval 3 + reviewed 记账", () => {
  rateUnit("a1-001", "good");
  assert.equal(getReviewsCache()["a1-001"].interval, 3);
  assert.equal(getTodayActivity().reviewed, 1);
});

// ---- App 重启后数据恢复 ----
test("App 重启后数据恢复：storage 无内存态，重读即恢复", () => {
  // storage.ts 每次调用都走 mock 存储（backing 保留）→ 重启等价于重新调用
  const before = getReviewsCache();
  const activityBefore = getActivity();
  // 模拟重启：模块重新执行（这里通过重新读取验证持久层）
  assert.deepEqual(getReviewsCache(), before);
  assert.deepEqual(getActivity(), activityBefore);
  // 上一条测试 rateUnit("a1-001","good") 已将其从 learning 推进到 review
  assert.equal(getReviewsCache()["a1-001"].status, "review");
  assert.equal(streakDaysLocal() >= 1, true);
});

// ---- 无网络 / 接口失败 ----
test("无网络：syncNow 返回 offline，pending 事件保留", () => {
  setToken("tok-sync", 3600);
  setRequestHandler(() => {
    throw new Error("network down");
  });
  // 先制造未同步变更
  markLearned("a1-002");

  return syncNow().then((r) => {
    assert.equal(r, "offline");
    // 网络恢复后重试（handler 换掉）
    setRequestHandler((opts) => {
      assert.ok(opts.url.includes("/api/progress"));
      return { statusCode: 200, data: { ok: true, accepted: true, serverUpdatedAt: Date.now() } };
    });
    return syncNow().then((r2) => {
      assert.equal(r2, "ok");
    });
  });
});

// ---- 云端恢复（换设备/重装后采纳服务端状态） ----
test("云端恢复：服务端更新 → 本地采纳（含 activity 与 reviews）", async () => {
  const serverReviews: Record<string, ReviewState> = {
    "b1-001": {
      status: "review",
      interval: 7,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      correctCount: 4,
      wrongCount: 0,
      productionCorrect: 2,
      productionWrong: 0,
      productionDays: [today],
    },
  };
  const serverActivity: Record<string, DayActivity> = {
    [today]: {
      newLearned: 5,
      reviewed: 2,
      listening: 0,
      output: 0,
      recallCorrect: 4,
      recallTotal: 5,
      listeningCorrect: 3,
      listeningTotal: 3,
      wrongIds: [],
      meaningCorrect: 4,
      meaningTotal: 5,
      chunkCorrect: 1,
      chunkTotal: 2,
    },
  };

  // 本地干净（重装），服务端有数据
  simulateReinstall();
  setToken("fake-token", 3600);

  setRequestHandler((opts) => {
    assert.ok(opts.url.includes("/api/progress"));
    return {
      statusCode: 200,
      data: { updatedAt: Date.now(), reviews: serverReviews, activity: serverActivity },
    };
  });

  const r = await syncNow();
  assert.equal(r, "adopted");
  assert.equal(getReviewsCache()["b1-001"].status, "review");
  assert.equal(getTodayActivity().newLearned, 5);
  // 重装后额度记账恢复：今日已学 5 → Free 额度已用完
  const { remainingNewToday } = await import("../src/services/membership.js");
  const { getCachedMembership } = await import("../src/services/membership.js");
  const m = { ...getCachedMembership(), usage: { date: today, newLearnedToday: 5 } };
  assert.equal(remainingNewToday(m, getTodayActivity().newLearned), 0);
});

// ---- token 持久化 ----
test("token 存取：setToken 后可读回（重启恢复登录态的基础）", () => {
  setToken("tok-abc", 3600);
  assert.equal(getToken(), "tok-abc");
});

// ---- 偏好持久化 ----
test("偏好：默认 dailyNew=20（首页显示会被 Entitlement 压到 5）", () => {
  simulateReinstall();
  assert.equal(getPrefs().dailyNew, 20);
  assert.equal(getPrefs().startLevel, "Starter");
});

// ---- 存储限量保护 ----
test("活动记录限量 90 天：超限裁剪最旧", async () => {
  const { setActivityAll } = await import("../src/utils/storage.js");
  const all: Record<string, DayActivity> = {};
  for (let i = 0; i < 120; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    all[d] = { ...getTodayActivity(), newLearned: 1 };
  }
  setActivityAll(all);
  assert.equal(Object.keys(getActivity()).length, 90);
});
