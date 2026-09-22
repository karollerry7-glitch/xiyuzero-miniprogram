// 学习会话页 — Phase 2 核心：5D 五步卡 → 主动回忆 → 四档评分 → SRS 排程
// 流程与 Web 端 app/learn/page.tsx 一致（flash → recall → done）；
// 评分语义与 Web lib/store.ts 完全一致（services/progress.ts）
import { useEffect, useMemo, useRef, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Button, Input } from "@tarojs/components";
import type { Rating, UnitFull } from "../../shared/types";
import { acceptedForms, checkAnswer } from "../../shared/answer";
import { fetchUnitsByIds, fetchUnitsPage } from "../../services/units";
import { markLearned, rateUnit, recordRecallResult } from "../../services/progress";
import { syncNow } from "../../services/sync";
import { speak, preload } from "../../services/tts";
import { getPrefs, getReviewsCache, getTodayActivity, setLastOrbitWords } from "../../utils/storage";
import {
  fetchMembership,
  getCachedMembership,
  effectiveDailyGoal,
  remainingNewToday,
  MembershipView,
} from "../../services/membership";
import { FREE_DAILY_NEW_WORD_LIMIT } from "../../config/membership";
import { Loading, ErrorState, EmptyState } from "../../components/states";
import "./index.scss";

type Phase = "loading" | "error" | "flash" | "recall" | "done" | "alldone" | "quota";

const STEPS = [
  { key: "sound", label: "发音" },
  { key: "meaning", label: "含义" },
  { key: "grammar", label: "语法" },
  { key: "chunk", label: "词块" },
  { key: "sentence", label: "例句" },
] as const;

const RATINGS: { key: Rating; label: string; hint: string }[] = [
  { key: "again", label: "再来一次", hint: "10 分钟" },
  { key: "hard", label: "困难", hint: "1 天" },
  { key: "good", label: "掌握", hint: "3 天" },
  { key: "easy", label: "太简单", hint: "7 天" },
];

const LEVELS = ["Starter", "A1", "A2", "B1", "B2"];

/** 组装今日新词队列：API 找新词（本地 reviews 过滤）→ ids 批量取 5D 完整卡
 *  maxNew：本次会话最多学几个新词（Entitlement 层计算的剩余额度）
 *  allowedLevels：null = 不限（Pro）；Free = Starter + A1 */
async function buildQueue(
  maxNew: number,
  allowedLevels: readonly string[] | null
): Promise<UnitFull[]> {
  const reviews = getReviewsCache();
  const prefs = getPrefs();
  const need = Math.max(0, Math.min(prefs.dailyNew, maxNew));
  const collected: string[] = [];

  const startIdx = Math.max(0, LEVELS.indexOf(prefs.startLevel));
  outer: for (let li = startIdx; li < LEVELS.length; li++) {
    const level = LEVELS[li];
    if (allowedLevels && !allowedLevels.includes(level)) break; // Free 词库边界
    for (let page = 1; ; page++) {
      const res = await fetchUnitsPage(level, page, 50);
      for (const s of res.items) {
        const r = reviews[s.id];
        if (r && r.status !== "new") continue;
        if (!collected.includes(s.id)) collected.push(s.id);
        if (collected.length >= need) break outer;
      }
      if (page * 50 >= res.total) break;
    }
  }
  if (collected.length === 0) return [];
  return fetchUnitsByIds(collected.slice(0, need));
}

export default function SessionPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<UnitFull[]>([]);
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<null | "correct" | "close" | "wrong">(null);
  const [stats, setStats] = useState({ correct: 0, close: 0, wrong: 0 });
  // 防连击：反馈出现后 350ms 内忽略评分点击（对齐 Web GUARD_MS）
  const fbAt = useRef(0);
  // 会员视图（Entitlement 层）
  const [member, setMember] = useState<MembershipView>(() => getCachedMembership());

  const load = async () => {
    setPhase("loading");
    try {
      // Entitlement：先尝试服务端视图（离线回落缓存）
      let m = member;
      try {
        m = await fetchMembership();
        setMember(m);
      } catch {
        /* 离线：使用缓存视图 */
      }

      // Free 额度：服务端用量与本地记账取大（防"断网学完→同步失败→再学"绕过）
      const remaining = remainingNewToday(m, getTodayActivity().newLearned);
      if (remaining !== null && remaining <= 0) {
        setPhase("quota");
        return;
      }
      // remaining = null（Pro 不限）；Free 时把本次会话上限压到剩余额度
      const maxNew = remaining === null ? Number.POSITIVE_INFINITY : remaining;
      const allowed = m.entitlements.levels; // null = Pro 不限

      const cards = await buildQueue(maxNew, allowed);
      if (cards.length === 0) {
        setPhase("alldone");
        return;
      }
      setQueue(cards);
      setIdx(0);
      setStep(0);
      setPhase("flash");
    } catch {
      setPhase("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unit = queue[idx];

  // 进入新词卡自动播发音
  useDidShow(() => {
    if (phase === "flash" && unit) speak(unit.spanish);
  });
  useEffect(() => {
    if (phase === "flash" && unit) {
      const t = setTimeout(() => speak(unit.spanish), 300);
      // 预缓冲下一张卡的发音（切卡时秒播）
      const next = queue[idx + 1];
      if (next) preload(next.spanish);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // 进入词块/例句步骤时预缓冲该步音频
  useEffect(() => {
    if (phase === "flash" && unit?.fiveD) {
      const f = unit.fiveD;
      if (step === 3 && f.chunks[0]) preload(f.chunks[0].spanish);
      if (step === 4 && f.sentences[0]) preload(f.sentences[0].spanish);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, idx, phase]);

  const last = step === STEPS.length - 1;

  const goNext = () => {
    if (last) startRecall();
    else setStep(step + 1);
  };

  const startRecall = () => {
    if (unit) markLearned(unit.id);
    setInput("");
    setFeedback(null);
    setPhase("recall");
  };

  const submitRecall = () => {
    if (!unit || feedback !== null) return;
    const result = checkAnswer(
      input,
      unit.spanish,
      acceptedForms(unit.spanish, unit.article)
    );
    setFeedback(result);
    fbAt.current = Date.now();
    recordRecallResult(unit.id, result);
    setStats((s) => ({ ...s, [result]: s[result] + 1 }));
    speak(unit.spanish);
  };

  const submitRating = (r: Rating) => {
    if (!unit || Date.now() - fbAt.current < 350) return;
    rateUnit(unit.id, r);
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
      setStep(0);
      setInput("");
      setFeedback(null);
      setPhase("flash");
    } else {
      // 会话完成 → 云端同步（让服务端及时拿到今日用量，跨设备额度一致）
      syncNow();
      // 达成今日新词目标 → 星轨打卡页（Phase 13 仪式页；数据为当日真实学习记录）
      const goal = effectiveDailyGoal(member, getPrefs().dailyNew);
      if (queue.length > 0 && getTodayActivity().newLearned >= goal) {
        setLastOrbitWords(
          queue.map((u) => ({
            id: u.id,
            spanish: u.spanish,
            chinese: u.chinese,
          }))
        );
        Taro.redirectTo({
          url: "/pages/orbit/index",
          fail: () => setPhase("done"),
        });
        return;
      }
      setPhase("done");
    }
  };

  const exit = () => {
    Taro.navigateBack({
      fail: () => Taro.switchTab({ url: "/pages/learn/index" }),
    });
  };

  const goHome = () => Taro.switchTab({ url: "/pages/learn/index" });
  const goReview = () => Taro.switchTab({ url: "/pages/review/index" });

  const progressText = useMemo(() => {
    if (phase === "flash" || phase === "recall")
      return `新学习 ${idx + 1} / ${queue.length}`;
    if (phase === "done") return "完成";
    return "";
  }, [phase, idx, queue.length]);

  // ---------- 渲染 ----------
  if (phase === "loading") {
    return (
<View className="session" key="loading">
        <Loading text="正在准备今日学习内容…" />
      </View>
    );
  }

  if (phase === "error") {
    return (
<View className="session" key="error">
        <ErrorState
          title="加载失败"
          desc="请检查网络后重试"
          onRetry={load}
        />
      </View>
    );
  }

  if (phase === "alldone") {
    return (
      <View className="session" key="alldone">
        <EmptyState
          icon="🎉"
          title="今日新内容已学完"
          desc="当前词库的新表达已经全部学习过了"
        />
        <View className="done__actions">
          <Button className="btn-main" onClick={goReview}>
            去复习 →
          </Button>
          <Button className="btn-outline" onClick={goHome}>
            回到首页
          </Button>
        </View>
      </View>
    );
  }

  // Free 每日额度用完：自然的 Pro 升级提示（不删数据、复习照常）
  if (phase === "quota") {
    return (
      <View className="session" key="quota">
        <View className="done">
          <Text className="done__icon">🌅</Text>
          <Text className="done__title">今日 {FREE_DAILY_NEW_WORD_LIMIT} 个新词已学完</Text>
          <Text className="done__desc">
            明天再来学新词。已学内容不会丢失，复习不受限制——现在就去巩固吧。
          </Text>
          <View className="quota-upgrade" onClick={() => Taro.navigateTo({ url: "/pages/membership/index" })}>
            <Text className="quota-upgrade__title">
              升级 Pro · 每日不限新词
            </Text>
            <Text className="quota-upgrade__sub">¥19.9 / 月 · 年卡折合每月约 ¥10.7</Text>
            <Text className="quota-upgrade__arrow">›</Text>
          </View>
          <View className="done__actions">
            <Button className="btn-main" onClick={goReview}>
              去复习 →
            </Button>
            <Button className="btn-outline" onClick={goHome}>
              回到首页
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (phase === "done") {
    return (
      <View className="session" key="done">
        <View className="done">
          <Text className="done__icon">🎉</Text>
          <Text className="done__title">今日学习完成</Text>
          <Text className="done__desc">
            学习了 {queue.length} 个新表达，系统已自动安排复习
          </Text>
          <View className="done__stats">
            <View className="done__stat">
              <Text className="done__stat-num">{stats.correct}</Text>
              <Text className="done__stat-label">完全正确</Text>
            </View>
            <View className="done__stat">
              <Text className="done__stat-num">{stats.close}</Text>
              <Text className="done__stat-label">接近正确</Text>
            </View>
            <View className="done__stat">
              <Text className="done__stat-num">{stats.wrong}</Text>
              <Text className="done__stat-label">需加强</Text>
            </View>
          </View>
          <View className="done__actions">
            <Button className="btn-main" onClick={goHome}>
              回到首页
            </Button>
            <Button className="btn-outline" onClick={goReview}>
              继续复习
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (!unit) return null;

  const fiveD = unit.fiveD;

  return (
<View className="session" key={phase}>
      {/* 顶栏 */}
      <View className="topbar">
        <Text className="topbar__progress">{progressText}</Text>
        <Text className="topbar__exit" onClick={exit}>
          退出
        </Text>
      </View>

      {/* ============ 五步卡 ============ */}
      {phase === "flash" && (
        <View className="card">
          <View className="card-head">
            <View className="card-head__left">
              <Text className="card-head__level">{unit.level}</Text>
              <Text className="card-head__topic">{unit.topic}</Text>
            </View>
            {fiveD && (
              <View className="card-head__dots">
                {STEPS.map((s, i) => (
                  <View
                    key={s.key}
                    className={`dot ${i === step ? "dot--active" : i < step ? "dot--done" : ""}`}
                  />
                ))}
              </View>
            )}
          </View>

          {fiveD ? (
            <View>
              {/* D2 发音 */}
              {step === 0 && (
                <View>
                  <Text className="step-hint">① 先听发音，注意重音</Text>
                  <View className="sound__word">
                    <Text className="sound__text">{unit.spanish}</Text>
                    <View
                      className="audio-btn audio-btn--lg"
                      onClick={() => speak(unit.spanish)}
                    >
                      🔊
                    </View>
                  </View>
                  <View className="sound__panel">
                    <Text className="sound__syl">{fiveD.sound.syllables}</Text>
                    <Text className="sound__stress">{fiveD.sound.stress}</Text>
                  </View>
                  <Text className="sound__tip">点击 🔊 重听，可以跟读几遍</Text>
                </View>
              )}

              {/* D1 含义 */}
              {step === 1 && (
                <View className="meaning">
                  <Text className="step-hint">② 它最常用的意思</Text>
                  <Text className="meaning__word">{unit.spanish}</Text>
                  <Text className="meaning__main">{fiveD.meaning}</Text>
                  <Text className="meaning__tip">
                    先记住这一个意思就够，其他含义以后遇到再扩展
                  </Text>
                </View>
              )}

              {/* D3 语法 */}
              {step === 2 && (
                <View>
                  <Text className="step-hint">③ 必须知道的语法</Text>
                  {fiveD.grammar.map((g, i) => (
                    <View className="grammar__item" key={i}>
                      <Text className="grammar__num">{i + 1}</Text>
                      <Text className="grammar__text">{g}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* D4 词块 */}
              {step === 3 && (
                <View>
                  <Text className="step-hint">④ 它经常和这些词一起出现</Text>
                  {fiveD.chunks.map((c, i) => (
                    <View className="chunk__item" key={i}>
                      <View>
                        <Text className="chunk__es">{c.spanish}</Text>
                        <Text className="chunk__zh">{c.chinese}</Text>
                      </View>
                      <View className="audio-btn" onClick={() => speak(c.spanish)}>
                        🔊
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* D5 例句 */}
              {step === 4 && (
                <View>
                  <Text className="step-hint">⑤ 放进真实句子里</Text>
                  {fiveD.sentences.map((s, i) => (
                    <View className="sent__item" key={i}>
                      <View className="sent__es">
                        <Text>{s.spanish}</Text>
                        <View className="audio-btn" onClick={() => speak(s.spanish)}>
                          🔊
                        </View>
                      </View>
                      <Text className="sent__zh">{s.chinese}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* 底部导航 */}
              <View className="nav">
                {step > 0 && (
                  <View className="nav__back" onClick={() => setStep(step - 1)}>
                    ← 上一步
                  </View>
                )}
                <View className="nav__next">
                  <Button className="btn-main" onClick={goNext}>
                    {last ? "我学会了，开始回忆 →" : `下一步：${STEPS[step + 1].label} →`}
                  </Button>
                </View>
              </View>
            </View>
          ) : (
            /* 无 5D 数据的兜底卡 */
            <View>
              <View className="fallback">
                <View className="sound__word">
                  <Text className="fallback__es">{unit.spanish}</Text>
                  <View className="audio-btn audio-btn--lg" onClick={() => speak(unit.spanish)}>
                    🔊
                  </View>
                </View>
                <Text className="fallback__zh">{unit.chinese}</Text>
                <Text className="fallback__meta">
                  {unit.partOfSpeech} · 频率 {unit.frequency}
                </Text>
                <Text className="fallback__ex">
                  {unit.example.spanish}
                  {"\n"}
                  {unit.example.chinese}
                </Text>
              </View>
              <View className="nav">
                <View className="nav__next">
                  <Button className="btn-main" onClick={startRecall}>
                    我记住了，开始回忆 →
                  </Button>
                </View>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ============ 主动回忆 ============ */}
      {phase === "recall" && (
        <View className="card">
          <Text className="recall__hint">Chinese → Spanish 主动回忆</Text>
          <Text className="recall__zh">{unit.chinese}</Text>

          {feedback === null ? (
            <View>
              <Input
                className="recall__input"
                value={input}
                onInput={(e) => setInput(e.detail.value)}
                onConfirm={submitRecall}
                placeholder="输入对应的西班牙语…"
                placeholderClass="recall__placeholder"
                focus
              />
              <View className="nav">
                <View className="nav__next">
                  <Button className="btn-main btn-main--dark" onClick={submitRecall}>
                    检查答案
                  </Button>
                </View>
              </View>
            </View>
          ) : (
            <View>
              <View className={`recall__feedback recall__feedback--${feedback}`}>
                {feedback === "correct"
                  ? "✓ 完全正确"
                  : feedback === "close"
                    ? "≈ 接近正确（注意拼写）"
                    : "✗ 错误"}
              </View>

              <View className="recall__answer">
                <Text className="recall__answer-text">{unit.spanish}</Text>
                <View className="audio-btn" onClick={() => speak(unit.spanish)}>
                  🔊
                </View>
              </View>
              <Text className="recall__example">
                {unit.example.spanish} — {unit.example.chinese}
              </Text>

              {fiveD && (
                <View className="recall__more">
                  {fiveD.grammar.slice(0, 2).map((g, i) => (
                    <Text className="recall__more-line" key={i}>
                      · {g}
                    </Text>
                  ))}
                  {fiveD.chunks[0] && (
                    <Text className="recall__more-line">
                      · 常用：{fiveD.chunks[0].spanish}（{fiveD.chunks[0].chinese}）
                    </Text>
                  )}
                </View>
              )}

              <View className="ratings">
                {RATINGS.map((r) => (
                  <View
                    className="ratings__btn"
                    key={r.key}
                    onClick={() => submitRating(r.key)}
                  >
                    <Text className="ratings__btn-label">{r.label}</Text>
                    <Text className="ratings__btn-hint">{r.hint}</Text>
                  </View>
                ))}
              </View>
              <Text className="ratings-tip">记住：完全正确选「掌握」，想不起来选「再来一次」</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
