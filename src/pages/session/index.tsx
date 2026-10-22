// 学习会话页 — Phase 2 核心：5D 五步卡 → 主动回忆 → 微型交流 → 四档评分 → SRS 排程
// 2026-10-21 Make It Stick 增量优化：
//   - 提交前隐藏参考（先提取后看答案）
//   - 有交流任务的词：回忆后进入「情境 → 西语表达 → 追问」微型交流
//   - 每次作答记入能力证据（独立/延迟/情境），掌握由证据推导
//   - 收费会员已移除：新词不受权益上限，仅受用户自设每日目标约束
import { useEffect, useMemo, useRef, useState } from "react";
import Taro, {useDidShow, useShareAppMessage, useShareTimeline} from "@tarojs/taro";
import { ensureShareMenu } from "../../shared/share";
import { View, Text, Button, Input } from "@tarojs/components";
import type { Rating, UnitFull } from "../../shared/types";
import { acceptedForms, checkAnswer } from "../../shared/answer";
import { parseConjugation } from "../../shared/conjugation";
import { gradeComm, recallToEvidence, type CommGrade } from "../../shared/grade";
import { fetchUnitsByIds, fetchUnitsPage } from "../../services/units";
import { markLearned, rateUnit, recordRecallResult } from "../../services/progress";
import { markExposure, peekExposure, recordAttempt } from "../../services/mastery";
import { syncNow } from "../../services/sync";
import { speak, preload } from "../../services/tts";
import { getPrefs, getReviewsCache, getTodayActivity, setLastOrbitWords, bumpTodayActivity } from "../../utils/storage";
import {
  reviewPressureBlocked,
  pickReviewFillIds,
} from "../../services/schedule";
import { Loading, ErrorState, EmptyState } from "../../components/states";
import "./index.scss";

type Phase = "loading" | "error" | "flash" | "recall" | "comm" | "rate" | "done" | "alldone";

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
  { key: "good", label: "掌握", hint: "升一阶" },
  { key: "easy", label: "太简单", hint: "跳两阶" },
];

const LEVELS = ["Starter", "A1", "A2", "B1", "B2"];

/** 组装今日新词队列：API 找新词（本地 reviews 过滤）→ ids 批量取 5D 完整卡 */
async function buildQueue(maxNew: number): Promise<UnitFull[]> {
  const reviews = getReviewsCache();
  const prefs = getPrefs();
  const need = Math.max(0, Math.min(prefs.dailyNew, maxNew));
  const collected: string[] = [];

  const startIdx = Math.max(0, LEVELS.indexOf(prefs.startLevel));
  outer: for (let li = startIdx; li < LEVELS.length; li++) {
    for (let page = 1; ; page++) {
      const res = await fetchUnitsPage(LEVELS[li], page, 50);
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

  // 转发与分享（页面缺钩子会显示「当前页面不可转发/不可分享」）
  useShareAppMessage(() => ({ title: "沃天澜·西语｜5D 五步法学西语，记得住才是真的会", path: "/pages/learn/index" }));
  useShareTimeline(() => ({ title: "沃天澜·西语｜5D 五步法学西语，记得住才是真的会" }));
  ensureShareMenu();

  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<UnitFull[]>([]);
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<null | "correct" | "close" | "wrong">(null);
  const [stats, setStats] = useState({ correct: 0, close: 0, wrong: 0 });
  // 交流任务状态：step 0 = 原情境，1 = 追问，2 = 交流完成
  const [commStep, setCommStep] = useState(0);
  const [commInput, setCommInput] = useState("");
  const [commGrade, setCommGrade] = useState<CommGrade | null>(null);
  // 词块提示：揭示后本次作答不再记独立证据
  const [commHintShown, setCommHintShown] = useState(false);
  // 防连击：反馈出现后 350ms 内忽略评分点击
  const fbAt = useRef(0);
  // 复习巩固模式：待复习超阈值，当日新词配额改为旧词巩固
  const [fillMode, setFillMode] = useState(false);
  // 证据暴露冻结：题目开始前取最近暴露时间（延迟判定基准，本题中揭示不影响本题）
  const frozenExpo = useRef(0);

  const load = async () => {
    setPhase("loading");
    try {
      // 复习压力控制：待复习 > 100 时暂停新词，配额改由旧词巩固填满
      const reviews = getReviewsCache();
      const dueCount = Object.values(reviews).filter(
        (r) =>
          r.status !== "new" &&
          new Date(r.dueDate).getTime() <= Date.now()
      ).length;
      if (reviewPressureBlocked(dueCount)) {
        const goal = getPrefs().dailyNew;
        const fillIds = pickReviewFillIds(reviews, goal);
        const fillCards = await fetchUnitsByIds(fillIds);
        if (fillCards.length > 0) {
          setQueue(fillCards);
          setIdx(0);
          setStep(0);
          setFillMode(true);
          startRecallOf(fillCards[0]);
          return;
        }
      }
      setFillMode(false);

      const cards = await buildQueue(Number.POSITIVE_INFINITY);
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

  /** 进入回忆阶段（题面揭示前冻结暴露时间） */
  const startRecallOf = (u: UnitFull) => {
    frozenExpo.current = peekExposure(u.id, "recognize");
    setInput("");
    setFeedback(null);
    setCommStep(0);
    setCommInput("");
    setCommGrade(null);
    setCommHintShown(false);
    setPhase("recall");
  };

  const startRecall = () => {
    if (!unit) return;
    // 复习巩固模式的词不是新词：不记 markLearned（避免污染今日新词计数）
    if (!fillMode) markLearned(unit.id);
    startRecallOf(unit);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unit = queue[idx];

  // 进入新词卡自动播发音；同时记教学暴露（5D 卡展示 = 认词通道的暴露时间）
  useDidShow(() => {
    if (phase === "flash" && unit) speak(unit.spanish);
  });
  useEffect(() => {
    if (phase === "flash" && unit) {
      markExposure(unit.id, "recognize");
      const t = setTimeout(() => speak(unit.spanish), 300);
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

  const submitRecall = () => {
    if (!unit || feedback !== null) return;
    const result = checkAnswer(
      input,
      unit.spanish,
      acceptedForms(unit.spanish, unit.article)
    );
    setFeedback(result);
    fbAt.current = Date.now();
    // 记账：SRS 统计（保留）+ 能力证据（新增）
    recordRecallResult(unit.id, result);
    const ev = recallToEvidence(result);
    recordAttempt(unit.id, {
      channel: "recognize",
      scenarioId: "base",
      independent: true, // 回忆题提交前不显示任何提示/答案
      helpUsed: [],
      revise: false,
      communication: ev.communication,
      targetForm: ev.targetForm,
    });
    markExposure(unit.id, "recognize"); // 答案揭示 → 更新暴露基准（影响下一次延迟判定）
    setStats((s) => ({ ...s, [result]: s[result] + 1 }));
    speak(unit.spanish);
    // 有交流任务的新词 → 微型交流；巩固旧词与其他词 → 直接评分
    if (unit.comm && !fillMode) {
      enterComm();
    } else {
      toRate();
    }
  };

  // ============ 微型交流任务 ============

  const comm = unit?.comm;

  /** 进入交流步骤（冻结产出通道暴露时间） */
  const enterComm = () => {
    if (!unit) return;
    frozenExpo.current = peekExposure(unit.id, "produce");
    setCommInput("");
    setCommGrade(null);
    setCommHintShown(false);
    setPhase("comm");
  };

  const submitComm = () => {
    if (!unit || !comm || commGrade !== null) return;
    const task = commStep === 0 ? comm : comm.followUp;
    if (!task) return;
    const grade = gradeComm(commInput, task.check);
    setCommGrade(grade);
    fbAt.current = Date.now();
    // 独立性：提交前揭示了词块提示 → 不算独立证据（帮助类型明确记录）
    const independent = !commHintShown;
    recordAttempt(unit.id, {
      channel: "produce",
      scenarioId: commStep === 0 ? "base" : "followup",
      independent,
      helpUsed: commHintShown ? ["hint"] : [],
      revise: false,
      communication: grade.communication,
      targetForm: grade.targetForm === "none" ? null : grade.targetForm,
      frozenExposureAt: frozenExpo.current,
    });
    if (grade.communication === "pass") {
      // 情境表达成功 → 记一次输出（今日活动统计）
      bumpTodayActivity((d) => ({ ...d, output: d.output + 1 }));
    }
    // 参考表达已展示 → 更新暴露基准
    markExposure(unit.id, "produce");
    const ref = task.reference[0];
    if (ref) speak(ref);
  };

  /** 交流步骤推进：base → followup → 评分 */
  const commNext = () => {
    if (!unit) return;
    if (commStep === 0 && comm?.followUp) {
      setCommStep(1);
      setCommInput("");
      setCommGrade(null);
      setCommHintShown(false);
      return;
    }
    setPhase("rate");
  };

  /** 无交流任务的词：回忆反馈后直接评分 */
  const toRate = () => {
    setPhase("rate");
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
      // 会话完成 → 云端同步
      syncNow();
      // 达成今日新词目标 → 星轨打卡页（仅新词模式；巩固模式不计新词不触发）
      const goal = getPrefs().dailyNew;
      if (!fillMode && queue.length > 0 && getTodayActivity().newLearned >= goal) {
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
    if (phase === "flash" || phase === "recall" || phase === "comm" || phase === "rate") {
      return fillMode
        ? `复习巩固 ${idx + 1} / ${queue.length}`
        : `新学习 ${idx + 1} / ${queue.length}`;
    }
    if (phase === "done") return "完成";
    return "";
  }, [phase, idx, queue.length, fillMode]);

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

  if (phase === "done") {
    return (
      <View className="session" key="done">
        <View className="done">
          <Text className="done__icon">🎉</Text>
          <Text className="done__title">今日学习完成</Text>
          <Text className="done__desc">
            {fillMode
              ? `巩固了 ${queue.length} 个旧词，记忆更牢固了`
              : `学习了 ${queue.length} 个新表达，系统已自动安排复习`}
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
          <Text className="done__evidence-note">
            活动记录 ≠ 掌握证据：「能验证」以无提示独立提取 + 跨日保持为准，见我的页能力档案
          </Text>
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

      {/* 复习巩固模式提示：待复习超限，今日暂停新词 */}
      {fillMode && (
        <Text className="fill-hint">
          📌 待复习较多，今日暂停新词 · 巩固旧词记得更牢
        </Text>
      )}

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
                  {fiveD.grammar.map((g, i) => {
                    // 动词变位条目 → 每个人称单独一行、左对齐排版
                    const conj = parseConjugation(g);
                    return (
                      <View className="grammar__item" key={i}>
                        <Text className="grammar__num">{i + 1}</Text>
                        {conj ? (
                          <View className="conj">
                            <Text className="conj__title">{conj.title}</Text>
                            {conj.rows.map((r, j) => (
                              <View className="conj__row" key={j}>
                                <Text className="conj__pron">{r.pronoun}</Text>
                                <Text className="conj__form">{r.form}</Text>
                              </View>
                            ))}
                            {conj.note && (
                              <Text className="conj__note">{conj.note}</Text>
                            )}
                          </View>
                        ) : (
                          <Text className="grammar__text">{g}</Text>
                        )}
                      </View>
                    );
                  })}
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

      {/* ============ 主动回忆（提交前不显示答案） ============ */}
      {phase === "recall" && (
        <View className="card">
          <Text className="recall__hint">Chinese → Spanish 主动回忆</Text>
          <Text className="recall__zh">{unit.chinese}</Text>

          <View>
            <Input
              className="recall__input"
              value={input}
              onInput={(e) => setInput(e.detail.value)}
              onConfirm={submitRecall}
              placeholder="先自己想一想，输入对应的西班牙语…"
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
        </View>
      )}

      {/* ============ 微型交流（情境 → 表达 → 追问） ============ */}
      {phase === "comm" && comm && (() => {
        const task = commStep === 0 ? comm : comm.followUp;
        if (!task) return null;
        return (
        <View className="card">
          <Text className="comm__goal">🎯 我能：{commStep === 0 ? comm.goal : "听懂追问并继续交流"}</Text>
          {commStep === 0 ? (
            <View>
              <Text className="comm__scenario">{comm.scenario}</Text>
              <Text className="comm__task">{comm.task}</Text>
            </View>
          ) : (
            <View>
              <Text className="comm__scenario">对方回复：</Text>
              <View className="comm__prompt">
                <Text className="comm__prompt-es">{comm.followUp?.prompt}</Text>
                <Text className="comm__prompt-zh">{comm.followUp?.promptZh}</Text>
              </View>
              <Text className="comm__task">{comm.followUp?.task}</Text>
            </View>
          )}

          {commGrade === null ? (
            <View>
              <Input
                className="comm__input"
                value={commInput}
                onInput={(e) => setCommInput(e.detail.value)}
                onConfirm={submitComm}
                placeholder="用西语组织你的回应…"
                placeholderClass="recall__placeholder"
                focus
              />
              {!commHintShown ? (
                <Text className="comm__help" onClick={() => setCommHintShown(true)}>
                  想不起来？看词块提示（本次将不记独立证据）
                </Text>
              ) : (
                <View className="comm__hint-box">
                  <Text className="comm__hint-title">词块支架（本次不记独立证据）：</Text>
                  {(fiveD?.chunks ?? []).slice(0, 3).map((c, i) => (
                    <Text className="comm__hint-line" key={i}>
                      {c.spanish}（{c.chinese}）
                    </Text>
                  ))}
                </View>
              )}
              <View className="nav">
                <View className="nav__next">
                  <Button className="btn-main btn-main--dark" onClick={submitComm}>
                    提交回应
                  </Button>
                </View>
              </View>
            </View>
          ) : (
            <View className="comm__feedback">
              <View
                className={`comm__verdict comm__verdict--${commGrade.communication}`}
              >
                {commGrade.communication === "pass"
                  ? "✅ 意思表达清楚了，交流可以继续"
                  : commGrade.communication === "fail"
                    ? "✗ 交流未成功"
                    : "❓ 待复核（本次未判定，不计成功也不计失败）"}
              </View>

              {commGrade.issues.map((iss, i) => (
                <Text className="comm__issue" key={`i${i}`}>
                  · {iss}
                </Text>
              ))}
              {commGrade.notes.map((n, i) => (
                <Text className="comm__note" key={`n${i}`}>
                  · {n}
                </Text>
              ))}
              {commGrade.targetForm === "pass" && (
                <Text className="comm__target-ok">
                  ✓ 目标表达已使用——记一次主动产出证据
                </Text>
              )}

              <View className="comm__ref">
                <Text className="comm__ref-title">参考表达（不止一种说法）：</Text>
                {task.reference.map((r, i) => (
                  <View className="comm__ref-line" key={i}>
                    <Text className="comm__ref-es">{r}</Text>
                    <View className="audio-btn" onClick={() => speak(r)}>🔊</View>
                  </View>
                ))}
              </View>

              <View className="nav">
                <View className="nav__next">
                  <Button className="btn-main" onClick={commNext}>
                    {commStep === 0 && comm.followUp ? "对方又问了一句 →" : "完成交流，进入评分 →"}
                  </Button>
                </View>
              </View>
            </View>
          )}
        </View>
        );
      })()}

      {/* ============ 回忆反馈 + 评分（回忆/交流结束后统一在此） ============ */}
      {phase === "rate" && (
        <View className="card">
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
  );
}
