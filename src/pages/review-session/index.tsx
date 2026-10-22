// 复习会话页 — 到期词多模式轮换复习 → 四档评分 → SRS 排程
// 2026-10-21 Make It Stick 增量优化：
//   - 含义/词块/听写作答计入能力证据（延迟检索证据主要来自跨日复习）
//   - 有交流任务的词轮入「迁移情境」题型（改变角色/目的，检验真正的可用性）
//   - 小测完成正确记录日期（修复上版漏记 markQuizDone 的 bug）
import { useEffect, useRef, useState } from "react";
import Taro, { useShareAppMessage, useShareTimeline } from "@tarojs/taro";
import { ensureShareMenu } from "../../shared/share";
import { View, Text, Button, Input } from "@tarojs/components";
import type { Rating, UnitFull } from "../../shared/types";
import { acceptedForms, checkAnswer } from "../../shared/answer";
import { gradeComm, recallToEvidence, type CommGrade } from "../../shared/grade";
import { fetchUnitsByIds } from "../../services/units";
import { rateUnit, recordListeningResult, recordRecallResult } from "../../services/progress";
import { markExposure, peekExposure, recordAttempt } from "../../services/mastery";
import { syncNow } from "../../services/sync";
import { speak, preload } from "../../services/tts";
import { getReviewsCache } from "../../utils/storage";
import { isDue } from "../../shared/srs";
import { markQuizDone, pickQuizIds, QUIZ_SIZE } from "../../services/schedule";
import { Loading, ErrorState, EmptyState } from "../../components/states";
import "./index.scss";

type Phase = "loading" | "error" | "quiz" | "done" | "empty";
type Mode = "meaning" | "sound" | "chunk" | "comm";

const RATINGS: { key: Rating; label: string; hint: string }[] = [
  { key: "again", label: "再来一次", hint: "10 分钟" },
  { key: "hard", label: "困难", hint: "停留当前阶" },
  { key: "good", label: "掌握", hint: "升一阶" },
  { key: "easy", label: "太简单", hint: "跳两阶" },
];

const MODE_LABEL: Record<Mode, string> = {
  meaning: "含义回忆",
  sound: "发音听写",
  chunk: "词块回忆",
  comm: "迁移情境",
};

const MAX_PER_SESSION = 50;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** 到期队列：本地 reviews 里 status≠new 且到期的词，按到期时间排序；小测取 QUIZ_SIZE 个 */
async function buildQueue(isQuiz: boolean): Promise<UnitFull[]> {
  const reviews = getReviewsCache();
  let dueIds: string[];
  if (isQuiz) {
    dueIds = pickQuizIds(reviews, QUIZ_SIZE);
  } else {
    dueIds = Object.entries(reviews)
      .filter(([, r]) => r.status !== "new" && isDue(r))
      .sort(([, a], [, b]) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .map(([id]) => id)
      .slice(0, MAX_PER_SESSION);
  }
  if (dueIds.length === 0) return [];
  return fetchUnitsByIds(dueIds);
}

/** 第 i 题的题型（与下方 mode 推导一致；预加载用） */
function modeOf(queue: UnitFull[], i: number): Mode {
  const u = queue[i];
  if (!u) return "meaning";
  const fd = u.fiveD;
  const pool: Mode[] = fd ? ["meaning", "sound", "chunk"] : ["meaning"];
  if (u.comm) pool.push("comm");
  return pool[(hash(u.id) + i) % pool.length];
}

/** 第 i 题的标准答案（comm 模式无标准文本） */
function expectedOf(queue: UnitFull[], i: number): string {
  const u = queue[i];
  if (!u) return "";
  const fd = u.fiveD;
  const mode = modeOf(queue, i);
  if (mode === "chunk" && fd && fd.chunks.length > 0) {
    return fd.chunks[hash(u.id) % fd.chunks.length].spanish;
  }
  if (mode === "comm") return "";
  return u.spanish;
}

export default function ReviewSessionPage() {

  // 转发与分享（页面缺钩子会显示「当前页面不可转发/不可分享」）
  useShareAppMessage(() => ({ title: "沃天澜·西语｜智能间隔复习", path: "/pages/learn/index" }));
  useShareTimeline(() => ({ title: "沃天澜·西语｜智能间隔复习" }));
  ensureShareMenu();

  // 小测模式：/pages/review-session/index?mode=quiz（首页每 3 天的检索练习入口）
  const isQuiz =
    Taro.getCurrentInstance().router?.params?.mode === "quiz";
  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<UnitFull[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<null | "correct" | "close" | "wrong">(null);
  const [commGrade, setCommGrade] = useState<CommGrade | null>(null);
  const [stats, setStats] = useState({ correct: 0, close: 0, wrong: 0 });
  // 防连击：反馈出现后 350ms 内忽略评分点击
  const fbAt = useRef(0);
  // 证据暴露冻结：题面揭示前取最近暴露时间
  const frozenExpo = useRef(0);

  const load = async () => {
    setPhase("loading");
    try {
      const cards = await buildQueue(isQuiz);
      if (cards.length === 0) {
        setPhase("empty");
        return;
      }
      setQueue(cards);
      setIdx(0);
      setInput("");
      setFeedback(null);
      setCommGrade(null);
      setPhase("quiz");
    } catch {
      setPhase("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unit = queue[idx];

  // 模式选择：5D 词在含义/听写/词块维度轮换；有交流任务的词额外轮入「迁移情境」
  const fiveD = unit?.fiveD;
  const mode: Mode = modeOf(queue, idx);

  // 当前题的标准答案（chunk 模式取词块，其余取单词本身；comm 无标准文本）
  const chunkItem =
    mode === "chunk" && fiveD && fiveD.chunks.length > 0
      ? fiveD.chunks[hash(unit.id) % fiveD.chunks.length]
      : null;
  const expected = chunkItem ? chunkItem.spanish : unit?.spanish ?? "";

  // 换题时冻结暴露时间（本题判定的基准）+ 清空反馈
  useEffect(() => {
    if (phase === "quiz" && unit) {
      frozenExpo.current = peekExposure(unit.id, mode === "sound" ? "listen" : "recognize");
      if (mode === "comm") {
        frozenExpo.current = peekExposure(unit.id, "produce");
      }
      setInput("");
      setFeedback(null);
      setCommGrade(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase]);

  // sound 模式进入即自动播放；所有模式预缓冲当前题 + 下一题的音频（提交反馈秒播）
  useEffect(() => {
    if (phase === "quiz" && unit) {
      preload(expected);
      const nextExp = expectedOf(queue, idx + 1);
      if (nextExp) preload(nextExp);
    }
    if (phase === "quiz" && mode === "sound" && unit) {
      const t = setTimeout(() => speak(expected), 300);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase]);

  const submit = () => {
    if (!unit || feedback !== null || !expected) return;
    const result = checkAnswer(
      input,
      expected,
      chunkItem ? [] : acceptedForms(unit.spanish, unit.article)
    );
    setFeedback(result);
    fbAt.current = Date.now();
    // 记账：SRS 统计（保留）+ 能力证据（跨日延迟证据的主要来源）
    if (mode === "sound") {
      recordListeningResult(unit.id, result !== "wrong");
      const ev = recallToEvidence(result);
      recordAttempt(unit.id, {
        channel: "listen",
        scenarioId: "review",
        independent: true, // 听写题提交前不显示文本（重复播放按任务条件允许，不判失败）
        helpUsed: [],
        revise: false,
        communication: ev.communication,
        targetForm: ev.targetForm,
        frozenExposureAt: frozenExpo.current,
      });
      markExposure(unit.id, "listen"); // 答案文本揭示
    } else {
      recordRecallResult(unit.id, result, mode === "chunk" ? "chunk" : "meaning");
      const ev = recallToEvidence(result);
      recordAttempt(unit.id, {
        channel: "recognize",
        scenarioId: "review",
        independent: true,
        helpUsed: [],
        revise: false,
        communication: ev.communication,
        targetForm: ev.targetForm,
        frozenExposureAt: frozenExpo.current,
      });
      markExposure(unit.id, "recognize"); // 答案揭示
    }
    setStats((s) => ({ ...s, [result]: s[result] + 1 }));
    speak(expected);
  };

  // ============ 迁移情境题（交流任务，检验角色/目的变化后的可用性） ============
  const commTask = unit?.comm
    ? (unit.comm.transfer ?? {
        scenario: unit.comm.scenario,
        task: unit.comm.task,
        check: unit.comm.check,
        reference: unit.comm.reference,
      })
    : null;

  const submitComm = () => {
    if (!unit || !commTask || commGrade !== null) return;
    const grade = gradeComm(input, commTask.check);
    setCommGrade(grade);
    fbAt.current = Date.now();
    recordAttempt(unit.id, {
      channel: "produce",
      scenarioId: unit.comm?.transfer ? "transfer" : "review",
      independent: true, // 迁移题提交前不显示参考
      helpUsed: [],
      revise: false,
      communication: grade.communication,
      targetForm: grade.targetForm === "none" ? null : grade.targetForm,
      frozenExposureAt: frozenExpo.current,
    });
    markExposure(unit.id, "produce"); // 参考表达揭示
    const ref = commTask.reference[0];
    if (ref) speak(ref);
  };

  const submitRating = (r: Rating) => {
    if (!unit || Date.now() - fbAt.current < 350) return;
    rateUnit(unit.id, r);
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
    } else {
      setPhase("done");
      // 小测完成 → 记录日期，重置 3 天周期（修复上版漏记导致小测反复出现的 bug）
      if (isQuiz) markQuizDone();
      // 会话完成 → 云端同步（fire-and-forget）
      syncNow();
    }
  };

  const exit = () => {
    Taro.navigateBack({
      fail: () => Taro.switchTab({ url: "/pages/review/index" }),
    });
  };

  const goHome = () => Taro.switchTab({ url: "/pages/learn/index" });
  const goLibrary = () => Taro.switchTab({ url: "/pages/library/index" });

  // ---------- 渲染 ----------
  if (phase === "loading") {
    return (
      <View className="session" key="loading">
        <Loading text={isQuiz ? "正在生成复习小测…" : "正在准备复习内容…"} />
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View className="session" key="error">
        <ErrorState title="加载失败" desc="请检查网络后重试" onRetry={load} />
      </View>
    );
  }

  if (phase === "empty") {
    return (
      <View className="session" key="empty">
        <EmptyState
          icon="🎉"
          title="现在没有到期复习"
          desc="SRS 会在合适的时间提醒你回来复习"
        />
        <View className="done__actions">
          <Button className="btn-main" onClick={goHome}>
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
          <Text className="done__icon">✅</Text>
          <Text className="done__title">{isQuiz ? "小测完成 📝" : "本轮复习完成"}</Text>
          <Text className="done__desc">
            {isQuiz
              ? `${queue.length} 个词检索练习完成，3 天后自动出现下一次小测`
              : `复习了 ${queue.length} 个表达，进度已同步到云端`}
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
            <Button className="btn-outline" onClick={goLibrary}>
              逛逛词库
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (!unit) return null;

  // 提示文本：含义/词块显示中文，听写不显示
  const promptText =
    mode === "meaning"
      ? fiveD
        ? fiveD.meaning
        : unit.chinese
      : chunkItem
        ? chunkItem.chinese
        : "";

  return (
    <View className="session" key="quiz">
      {/* 顶栏 */}
      <View className="topbar">
        <Text className="topbar__progress">
          {isQuiz ? "小测" : "复习"} {idx + 1} / {queue.length}
        </Text>
        <Text className="topbar__exit" onClick={exit}>
          退出
        </Text>
      </View>

      <View className="card">
        <Text className="mode-badge">{MODE_LABEL[mode]}</Text>

        {/* 迁移情境题：改变角色/目的的交流任务（提交前不显示参考） */}
        {mode === "comm" && commTask ? (
          <View>
            <Text className="comm__scenario">{commTask.scenario}</Text>
            <Text className="comm__task">{commTask.task}</Text>

            {commGrade === null ? (
              <View>
                <Input
                  className="comm__input"
                  value={input}
                  onInput={(e) => setInput(e.detail.value)}
                  onConfirm={submitComm}
                  placeholder="用西语组织你的回应…"
                  placeholderClass="recall__placeholder"
                  focus
                />
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
                <View className={`comm__verdict comm__verdict--${commGrade.communication}`}>
                  {commGrade.communication === "pass"
                    ? "✅ 意思表达清楚了，交流可以继续"
                    : commGrade.communication === "fail"
                      ? "✗ 交流未成功"
                      : "❓ 待复核（不计成功也不计失败）"}
                </View>
                {commGrade.issues.map((iss, i) => (
                  <Text className="comm__issue" key={`i${i}`}>· {iss}</Text>
                ))}
                {commGrade.notes.map((n, i) => (
                  <Text className="comm__note" key={`n${i}`}>· {n}</Text>
                ))}
                {commGrade.targetForm === "pass" && (
                  <Text className="comm__target-ok">
                    ✓ 目标表达已使用——记一次迁移情境证据
                  </Text>
                )}
                <View className="comm__ref">
                  <Text className="comm__ref-title">参考表达（不止一种说法）：</Text>
                  {commTask.reference.map((r, i) => (
                    <View className="comm__ref-line" key={i}>
                      <Text className="comm__ref-es">{r}</Text>
                      <View className="audio-btn" onClick={() => speak(r)}>🔊</View>
                    </View>
                  ))}
                </View>
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
                <Text className="ratings-tip">交流成功但目标词未用？仍算复习完成，目标词下次再验</Text>
              </View>
            )}
          </View>
        ) : (
          <View>
          {/* 听写模式：只播声音 */}
          {mode === "sound" ? (
            <View className="listen-panel">
              <View className="listen-panel__btn" onClick={() => speak(expected)}>
                🔊
              </View>
              <Text className="listen-panel__tip">听发音，输入你听到的内容（可重复播放）</Text>
            </View>
          ) : (
            <View>
              <Text className="recall__hint">
                {mode === "meaning" ? "Chinese → Spanish" : "这个词块用西班牙语怎么说？"}
              </Text>
              <Text className="recall__zh">{promptText}</Text>
            </View>
          )}

          {feedback === null ? (
            <View>
              <Input
                className="recall__input"
                value={input}
                onInput={(e) => setInput(e.detail.value)}
                onConfirm={submit}
                placeholder="输入西班牙语…"
                placeholderClass="recall__placeholder"
                focus
              />
              <View className="nav">
                <View className="nav__next">
                  <Button className="btn-main btn-main--dark" onClick={submit}>
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
                <Text className="recall__answer-text">{expected}</Text>
                <View className="audio-btn" onClick={() => speak(expected)}>
                  🔊
                </View>
              </View>
              {mode !== "chunk" && (
                <Text className="recall__example">
                  {unit.example.spanish} — {unit.example.chinese}
                </Text>
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
              <Text className="ratings-tip">想不起来选「再来一次」，10 分钟后会再遇到它</Text>
            </View>
          )}
          </View>
        )}
      </View>
    </View>
  );
}
