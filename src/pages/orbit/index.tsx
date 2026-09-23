// 星轨打卡页 — 每日完成学习目标后的专属仪式（Phase 13）
// 数据来源：当日真实学习记录（会话完成时写入 xz_orbit_words）；
// 连续天数/本周累计由 activity 派生，天然幂等（刷新/重复进入不会重复计数）。
import { useEffect, useMemo, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, Image } from "@tarojs/components";
import { StarOrbit } from "../../components/star-orbit";
import { OrbitPoster, PosterData } from "../../components/orbit-poster";
import { quoteForDate } from "../../shared/quotes";
import { weekNewLearned } from "../../shared/orbit";
import { speak, preload } from "../../services/tts";
import { DEFAULT_NICKNAME } from "../../config/membership";
import {
  getActivity,
  getLastOrbit,
  getTodayActivity,
  getUser,
  markCheckinToday,
  streakDaysLocal,
  type OrbitWord,
} from "../../utils/storage";
import "./index.scss";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

interface NavMetrics {
  padTop: number; // 状态栏高度 px
  closeTop: number; // 关闭按钮 top px（与胶囊对齐）
  closeRight: number; // 关闭按钮 right px（避开胶囊）
}

export default function OrbitPage() {
  const [words, setWords] = useState<OrbitWord[]>([]);
  const [total, setTotal] = useState(0); // 最终词数
  const [count, setCount] = useState(0); // 动效计数 0→total
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stats, setStats] = useState({ streak: 0, week: 0 });
  const [posterOpen, setPosterOpen] = useState(false);
  const [nav, setNav] = useState<NavMetrics>({
    padTop: 20,
    closeTop: 26,
    closeRight: 96,
  });

  // ---- 初始化：读取当日真实学习记录（无记录时静态兜底） ----
  useEffect(() => {
    const rec = getLastOrbit();
    const ws = rec?.words ?? [];
    // 兜底：无当日词轨数据（如冷启动直接进入）→ 用今日活动数静态展示
    const fromActivity = getTodayActivity().newLearned;
    const finalTotal = ws.length > 0 ? ws.length : fromActivity;

    setWords(ws);
    setTotal(finalTotal);
    setStats({
      streak: streakDaysLocal(),
      week: weekNewLearned(getActivity()),
    });
    // 幂等打卡（重复进入不重复记录）
    markCheckinToday();
    // 预缓冲前几个词的发音（点击星体秒播）
    ws.slice(0, 4).forEach((w) => preload(w.spanish));
  }, []);

  // ---- 中央数字 0 → total 平滑增长（~0.9s） ----
  useEffect(() => {
    if (total <= 0) return;
    const step = Math.max(60, Math.round(900 / total));
    let c = 0;
    const t = setInterval(() => {
      c += 1;
      setCount(c);
      if (c >= total) clearInterval(t);
    }, step);
    return () => clearInterval(t);
  }, [total]);

  // ---- 导航布局（状态栏 + 避开右上角胶囊） ----
  useEffect(() => {
    try {
      const info = Taro.getSystemInfoSync();
      let closeTop = (info.statusBarHeight || 20) + 6;
      let closeRight = 96;
      try {
        const cap = Taro.getMenuButtonBoundingClientRect();
        if (cap && cap.top) {
          closeTop = cap.top;
          closeRight = info.windowWidth - cap.left + 10;
        }
      } catch {
        /* 部分环境无胶囊信息：用兜底值 */
      }
      setNav({
        padTop: info.statusBarHeight || 20,
        closeTop,
        closeRight,
      });
    } catch {
      /* 保底默认值 */
    }
  }, []);

  const quote = useMemo(() => quoteForDate(), []);

  // ---- 用户昵称/头像（本地缓存读取，绝不触发授权弹窗） ----
  // 数据来源：登录时缓存于 storage 的 ServerUser（wx.login 静默 + 登录页昵称步）。
  // 未登录 / 未设置昵称（默认「西语学员」）→ 兜底「学习者」；海报侧兜底匿名署名。
  const { displayName, avatarUrl, posterNickname } = useMemo(() => {
    const u = getUser();
    const nick = (u?.nickname || "").trim();
    const real = !!nick && nick !== DEFAULT_NICKNAME;
    return {
      displayName: real ? nick : "学习者",
      avatarUrl: u?.avatar || null,
      posterNickname: real ? nick : null,
    };
  }, []);

  const dateText = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
      d.getDate()
    ).padStart(2, "0")} ${WEEKDAYS[d.getDay()]}`;
  }, []);

  // ---- 交互 ----
  const onStarTap = (w: OrbitWord) => {
    setActiveId((prev) => (prev === w.id ? null : w.id));
    speak(w.spanish);
  };

  const goHome = () => Taro.switchTab({ url: "/pages/learn/index" });
  const goReview = () => Taro.switchTab({ url: "/pages/review/index" });

  const posterData: PosterData = {
    words,
    count: total,
    streak: stats.streak,
    week: stats.week,
    nickname: posterNickname,
  };

  return (
    <View className="orbit">
      <View className="orbit__bg" />

      {/* ---- 顶部：日期 + 今日已完成 + 关闭 ---- */}
      <View className="orbit__nav" style={{ paddingTop: `${nav.padTop}px` }}>
        <View className="orbit__nav-inner">
          <Text className="orbit__date">{dateText}</Text>
          <Text className="orbit__title">今日已完成</Text>
        </View>
        <View
          className="orbit__close"
          style={{ top: `${nav.closeTop}px`, right: `${nav.closeRight}px` }}
          onClick={goHome}
        >
          <Text>✕</Text>
        </View>
      </View>

      {/* ---- 用户专属问候（头像 + Hi 昵称，介于标题与星轨之间） ---- */}
      <View className="orbit__greet">
        {avatarUrl ? (
          <Image
            className="orbit__greet-avatar"
            src={avatarUrl}
            mode="aspectFill"
          />
        ) : (
          <View className="orbit__greet-avatar orbit__greet-avatar--mono">
            <Text>沃</Text>
          </View>
        )}
        <View className="orbit__greet-col">
          <View className="orbit__greet-line">
            <Text className="orbit__greet-hi">Hi，</Text>
            <Text className="orbit__greet-name">{displayName}</Text>
          </View>
          <Text className="orbit__greet-sub">你的今日词轨已经点亮</Text>
        </View>
      </View>

      {/* ---- 星轨主视觉 ---- */}
      <View className="orbit__visual">
        <StarOrbit
          words={words}
          count={count}
          total={total}
          activeId={activeId}
          onStarTap={onStarTap}
          instant={words.length === 0}
        />
      </View>

      {/* ---- 文案 ---- */}
      <View className="orbit__phrase">
        <Text className="orbit__phrase-es">
          Hoy estás {total} {total === 1 ? "palabra" : "palabras"} más cerca.
        </Text>
        <Text className="orbit__phrase-zh">
          今天，你又离西班牙语更近了{total}个单词
        </Text>
      </View>

      {/* ---- 连续学习信息（简洁数字排版） ---- */}
      <View className="orbit__stats">
        <View className="orbit__stat">
          <Text className="orbit__stat-num">{stats.streak}</Text>
          <Text className="orbit__stat-label">连续学习 · 天</Text>
        </View>
        <View className="orbit__stats-divider" />
        <View className="orbit__stat">
          <Text className="orbit__stat-num">{stats.week}</Text>
          <Text className="orbit__stat-label">本周累计 · 词</Text>
        </View>
      </View>

      {/* ---- 今日记忆句 ---- */}
      <View className="orbit__quote">
        <Text className="orbit__quote-tag">RECUERDO DEL DÍA · 今日记忆句</Text>
        <Text className="orbit__quote-es">{quote.es}</Text>
        <Text className="orbit__quote-zh">{quote.zh}</Text>
      </View>

      {/* ---- 操作 ---- */}
      <View className="orbit__actions">
        <Button className="orbit__btn" onClick={() => setPosterOpen(true)}>
          生成今日词轨
        </Button>
        <Button className="orbit__btn orbit__btn--ghost" onClick={goReview}>
          继续复习
        </Button>
        <Text className="orbit__home" onClick={goHome}>
          回到首页
        </Text>
      </View>

      {/* ---- 品牌署名（沃天岚 · 西语ZERO） ---- */}
      <View className="orbit__brand">
        <View className="orbit__brand-line">
          <Text className="orbit__brand-main">沃天岚</Text>
          <Text className="orbit__brand-dot">·</Text>
          <Text className="orbit__brand-sub">西语ZERO</Text>
        </View>
        <Text className="orbit__brand-tag">每天认识一点新的世界</Text>
      </View>

      {/* ---- 海报 ---- */}
      {posterOpen && (
        <OrbitPoster data={posterData} onClose={() => setPosterOpen(false)} />
      )}
    </View>
  );
}
