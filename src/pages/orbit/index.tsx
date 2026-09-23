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

/** 顶部「回到首页」小图标（SVG：象牙白细线小房子） */
const HOME_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyNCcgaGVpZ2h0PScyNCcgdmlld0JveD0nMCAwIDI0IDI0JyBmaWxsPSdub25lJyBzdHJva2U9JyNGRkY5RUYnIHN0cm9rZS1vcGFjaXR5PScwLjg1JyBzdHJva2Utd2lkdGg9JzEuNicgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJyBzdHJva2UtbGluZWpvaW49J3JvdW5kJz48cGF0aCBkPSdNMy4yIDExLjQgMTIgNC40bDguOCA3Jy8+PHBhdGggZD0nTTUuOCAxMC4yVjE5LjhoMTIuNFYxMC4yJy8+PHBhdGggZD0nTTEwIDE5Ljh2LTVoNHY1Jy8+PC9zdmc+";

interface NavMetrics {
  padTop: number; // 状态栏高度 px
  closeTop: number; // 首页图标 top px（与胶囊对齐）
  closeRight: number; // 首页图标 right px（避开胶囊）
  /** 星轨边长（rpx）：可用高度的 38%~42%，页面单屏自适应的核心参数 */
  orbitSize: number;
  /** 可用高度 < 700px → 紧凑模式（缩短间距、隐藏装饰） */
  compact: boolean;
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
    orbitSize: 560,
    compact: false,
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

  // ---- 导航布局 + 单屏自适应参数（状态栏 / 胶囊避让 / 星轨尺寸 / 紧凑模式） ----
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
      const wh = info.windowHeight || 667;
      const ww = info.windowWidth || 375;
      const compact = wh < 700;
      // 星轨占可用高度 38%（紧凑）~42%（标准），px → rpx 换算并夹紧
      const orbitPx = Math.min(
        400,
        Math.max(240, wh * (compact ? 0.38 : 0.42))
      );
      const orbitSize = Math.round(orbitPx * (750 / ww));
      setNav({
        padTop: info.statusBarHeight || 20,
        closeTop,
        closeRight,
        orbitSize,
        compact,
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
    <View className={`orbit ${nav.compact ? "orbit--compact" : ""}`}>
      <View className="orbit__bg" />

      {/* ---- 顶部：日期 + 今日已完成 + 首页图标 ---- */}
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
          <Image className="orbit__close-icon" src={HOME_ICON} mode="aspectFit" />
        </View>
      </View>

      {/* ---- 用户专属问候（头像 + Hi 昵称） ---- */}
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

      {/* ---- 星轨主视觉（flex:1 吸收富余高度，保证单屏） ---- */}
      <View className="orbit__visual">
        <StarOrbit
          words={words}
          count={count}
          total={total}
          activeId={activeId}
          onStarTap={onStarTap}
          instant={words.length === 0}
          size={nav.orbitSize}
          compact={nav.compact}
        />
      </View>

      {/* ---- 完成信息（紧贴星轨） ---- */}
      <View className="orbit__phrase">
        <Text className="orbit__phrase-zh">今日学习完成</Text>
        <Text className="orbit__phrase-es">
          Hoy estás {total} {total === 1 ? "palabra" : "palabras"} más cerca.
        </Text>
      </View>

      {/* ---- 学习数据（横向并排小数据栏） ---- */}
      <View className="orbit__stats">
        <Text className="orbit__stat">
          连续学习 <Text className="orbit__stat-num">{stats.streak}</Text> 天
        </Text>
        <View className="orbit__stats-divider" />
        <Text className="orbit__stat">
          本周累计 <Text className="orbit__stat-num">{stats.week}</Text> 词
        </Text>
      </View>

      {/* ---- 今日记忆句（两行） ---- */}
      <View className="orbit__quote">
        <Text className="orbit__quote-es">{quote.es}</Text>
        <Text className="orbit__quote-zh">{quote.zh}</Text>
      </View>

      {/* ---- 操作：横排双按钮 ---- */}
      <View className="orbit__actions">
        <Button className="orbit__btn" onClick={() => setPosterOpen(true)}>
          生成今日词轨
        </Button>
        <Button className="orbit__btn orbit__btn--ghost" onClick={goReview}>
          继续复习
        </Button>
      </View>

      {/* ---- 品牌署名（页面内容底部，不遮挡按钮） ---- */}
      <View className="orbit__brand">
        <View className="orbit__brand-line">
          <Text className="orbit__brand-main">沃天澜</Text>
          <Text className="orbit__brand-dot">·</Text>
          <Text className="orbit__brand-sub">西语</Text>
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
