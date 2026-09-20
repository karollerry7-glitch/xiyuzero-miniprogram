// 复习会话页 — Phase 3 核心：到期词三模式轮换复习 → 四档评分 → SRS 排程
// 流程与 Web 端 app/review/page.tsx 一致（meaning/sound/chunk 轮换 → reveal → rating）；
// 完成后触发云端同步（services/sync.ts）。
import { useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, Input } from "@tarojs/components";
import type { Rating, UnitFull } from "../../shared/types";
import { acceptedForms, checkAnswer } from "../../shared/answer";
import { fetchUnitsByIds } from "../../services/units";
import { rateUnit, recordListeningResult, recordRecallResult } from "../../services/progress";
import { syncNow } from "../../services/sync";
import { speak } from "../../services/tts";
import { getReviewsCache } from "../../utils/storage";
import { isDue } from "../../shared/srs";
import { Loading, ErrorState, EmptyState } from "../../components/states";
import "./index.scss";

type Phase = "loading" | "error" | "quiz" | "done" | "empty";
type Mode = "meaning" | "sound" | "chunk";

const RATINGS: { key: Rating; label: string; hint: string }[] = [
  { key: "again", label: "再来一次", hint: "10 分钟" },
  { key: "hard", label: "困难", hint: "1 天" },
  { key: "good", label: "掌握", hint: "3 天" },
  { key: "easy", label: "太简单", hint: "7 天" },
];

const MODE_LABEL: Record<Mode, string> = {
  meaning: "含义回忆",
  sound: "发音听写",
  chunk: "词块回忆",
};

const MAX_PER_SESSION = 50;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** 到期队列：本地 reviews 里 status≠new 且到期的词，按到期时间排序 */
async function buildQueue(): Promise<UnitFull[]> {
  const reviews = getReviewsCache();
  const dueIds = Object.entries(reviews)
    .filter(([id, r]) => {
      void id;
      return r.status !== "new" && isDue(r);
    })
    .sort(([, a], [, b]) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .map(([id]) => id)
    .slice(0, MAX_PER_SESSION);
  if (dueIds.length === 0) return [];
  return fetchUnitsByIds(dueIds);
}

export default function ReviewSessionPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<UnitFull[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<null | "correct" | "close" | "wrong">(null);
  const [stats, setStats] = useState({ correct: 0, close: 0, wrong: 0 });
  // 防连击：反馈出现后 350ms 内忽略评分点击
  const fbAt = useRef(0);

  const load = async () => {
    setPhase("loading");
    try {
      const cards = await buildQueue();
      if (cards.length === 0) {
        setPhase("empty");
        return;
      }
      setQueue(cards);
      setIdx(0);
      setInput("");
      setFeedback(null);
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

  // 模式选择（与 Web 一致：5D 词在三个维度轮换，无 5D 固定含义回忆）
  const fiveD = unit?.fiveD;
  const mode: Mode = fiveD
    ? (["meaning", "sound", "chunk"] as Mode[])[(hash(unit.id) + idx) % 3]
    : "meaning";

  // 当前题的标准答案（chunk 模式取词块，其余取单词本身）
  const chunkItem =
    mode === "chunk" && fiveD && fiveD.chunks.length > 0
      ? fiveD.chunks[hash(unit.id) % fiveD.chunks.length]
      : null;
  const expected = chunkItem ? chunkItem.spanish : unit?.spanish ?? "";

  // sound 模式进入即自动播放
  useEffect(() => {
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
    // 记账：听写记 listening，含义/词块记 recall（mode 区分，供五维统计）
    if (mode === "sound") {
      recordListeningResult(unit.id, result !== "wrong");
    } else {
      recordRecallResult(unit.id, result, mode === "chunk" ? "chunk" : "meaning");
    }
    setStats((s) => ({ ...s, [result]: s[result] + 1 }));
    speak(expected);
  };

  const submitRating = (r: Rating) => {
    if (!unit || Date.now() - fbAt.current < 350) return;
    rateUnit(unit.id, r);
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
      setInput("");
      setFeedback(null);
    } else {
      setPhase("done");
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
        <Loading text="正在准备复习内容…" />
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
          <Text className="done__title">本轮复习完成</Text>
          <Text className="done__desc">
            复习了 {queue.length} 个表达，进度已同步到云端
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
          复习 {idx + 1} / {queue.length}
        </Text>
        <Text className="topbar__exit" onClick={exit}>
          退出
        </Text>
      </View>

      <View className="card">
        <Text className="mode-badge">{MODE_LABEL[mode]}</Text>

        {/* 听写模式：只播声音 */}
        {mode === "sound" ? (
          <View className="listen-panel">
            <View className="listen-panel__btn" onClick={() => speak(expected)}>
              🔊
            </View>
            <Text className="listen-panel__tip">听发音，输入你听到的内容</Text>
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
    </View>
  );
}
