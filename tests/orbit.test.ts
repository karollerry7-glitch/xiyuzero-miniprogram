// 星轨打卡测试 — 布局纯函数 / 每日记忆句 / 本周累计 / 打卡幂等
import { test } from "node:test";
import * as assert from "node:assert/strict";
import "./helpers/setup.js";
import {
  orbitStars,
  palabrasLabel,
  weekNewLearned,
} from "../src/shared/orbit.js";
import { quoteForDate, DAILY_QUOTES } from "../src/shared/quotes.js";
import {
  markCheckinToday,
  isCheckedInToday,
  setLastOrbitWords,
  getLastOrbit,
} from "../src/utils/storage.js";
import type { DayActivity } from "../src/shared/types.js";

const DAY = 86400000;

function emptyDay(n: number): DayActivity {
  return {
    newLearned: n,
    reviewed: 0,
    listening: 0,
    output: 0,
    recallCorrect: 0,
    recallTotal: 0,
    listeningCorrect: 0,
    listeningTotal: 0,
    wrongIds: [],
  };
}

test("orbitStars: 数量/确定性/落在轨道环上", () => {
  for (const n of [1, 5, 10, 20, 30]) {
    const a = orbitStars(n);
    const b = orbitStars(n);
    assert.equal(a.length, n);
    // 纯确定性：同 N 结果一致（动画/海报/多端可复现）
    assert.deepEqual(a, b);
    for (const p of a) {
      // 落在允许的轨道半径带（0.55/0.70/0.85 ± 微抖动）
      const fr = p.radiusFrac;
      const near =
        Math.abs(fr - 0.55) < 0.02 ||
        Math.abs(fr - 0.7) < 0.02 ||
        Math.abs(fr - 0.85) < 0.02;
      assert.ok(near, `radiusFrac ${fr} 应落在轨道环上`);
    }
  }
  assert.deepEqual(orbitStars(0), []);
});

test("palabrasLabel: 单复数", () => {
  assert.equal(palabrasLabel(1), "PALABRA");
  assert.equal(palabrasLabel(10), "PALABRAS");
});

test("quoteForDate: 同日稳定 / 跨日轮换 / 覆盖全部句库", () => {
  const d = new Date("2026-09-22T00:00:00Z");
  assert.equal(quoteForDate(d).es, quoteForDate(d).es);
  // 覆盖率：连续 DAILY_QUOTES.length 天恰好遍历全部句子
  const seen = new Set<string>();
  for (let i = 0; i < DAILY_QUOTES.length; i++) {
    seen.add(quoteForDate(new Date(d.getTime() + i * DAY)).es);
  }
  assert.equal(seen.size, DAILY_QUOTES.length);
});

test("weekNewLearned: 周一起算 / 跨周不重复计入", () => {
  // 2026-09-21 是周一；22 周二、23 周三
  const wed = new Date("2026-09-23T12:00:00Z");
  const activity: Record<string, DayActivity> = {
    "2026-09-19": emptyDay(9), // 上周六 — 不计入
    "2026-09-21": emptyDay(10), // 周一
    "2026-09-22": emptyDay(7), // 周二
    "2026-09-23": emptyDay(5), // 周三
  };
  assert.equal(weekNewLearned(activity, wed), 22);

  // 周一当天：只算周一
  const mon = new Date("2026-09-21T12:00:00Z");
  assert.equal(weekNewLearned(activity, mon), 10);

  // 空记录
  assert.equal(weekNewLearned({}, wed), 0);
});

test("markCheckinToday: 幂等（重复进入不重复打卡）", () => {
  assert.equal(isCheckedInToday(), false);
  assert.equal(markCheckinToday(), true); // 首次
  assert.equal(markCheckinToday(), false); // 重复
  assert.equal(isCheckedInToday(), true);
});

test("setLastOrbitWords: 当日多会话合并去重", () => {
  setLastOrbitWords([
    { id: "a", spanish: "hablar", chinese: "说话" },
    { id: "b", spanish: "tiempo", chinese: "时间" },
  ]);
  setLastOrbitWords([
    { id: "b", spanish: "tiempo", chinese: "时间" },
    { id: "c", spanish: "viaje", chinese: "旅行" },
  ]);
  const rec = getLastOrbit();
  assert.ok(rec);
  assert.equal(rec.words.length, 3); // a + b + c（b 去重）
  assert.equal(rec.words.map((w) => w.id).join(","), "a,b,c");
  assert.ok(rec.date); // 当日
});
