// 我的页 — 用户信息 + 学习统计 + 能力档案 + 完整菜单
// 数据来自既有 reviews / activity / evidence 缓存，不重写学习逻辑
// 2026-10-21：新增「能力档案」（证据推导的掌握状态）；2026-10-22：移除收费会员
import Taro, {useDidShow, useShareAppMessage, useShareTimeline} from "@tarojs/taro";
import { ensureShareMenu } from "../../shared/share";
import { useState } from "react";
import { View, Text } from "@tarojs/components";
import { useAuth } from "../../services/auth";
import { DEFAULT_NICKNAME } from "../../config/membership";
import { dimensionMastery, mySummary, recentTrend, wrongWords } from "../../shared/stats";
import { summarizeMastery, MASTERY_LABEL } from "../../shared/evidence";
import { getActivity, getEvidenceAll, getFavorites, getReviewsCache } from "../../utils/storage";
import type { DayActivity, ReviewState } from "../../shared/types";
import "./index.scss";

interface MenuItem {
  key: string;
  label: string;
  arrow: boolean;
  badge?: string; // 角标
  countKey?: "wrong" | "favorites"; // 右侧计数
}

const MENU: MenuItem[] = [
  { key: "goal", label: "学习目标", arrow: true },
  { key: "wrong", label: "错词本", arrow: true, countKey: "wrong" },
  { key: "favorites", label: "我的收藏", arrow: true, countKey: "favorites" },
  { key: "bind", label: "账户绑定", arrow: true },
  { key: "privacy", label: "隐私政策", arrow: true },
  { key: "terms", label: "用户协议", arrow: true },
  { key: "about", label: "关于沃天澜", arrow: true },
];

export default function MyPage() {

  // 转发与分享（页面缺钩子会显示「当前页面不可转发/不可分享」）
  useShareAppMessage(() => ({ title: "沃天澜·西语｜把西语真正学进脑子", path: "/pages/learn/index" }));
  useShareTimeline(() => ({ title: "沃天澜·西语｜把西语真正学进脑子" }));
  ensureShareMenu();

  const { user, loading, error, login } = useAuth();

  const [reviews, setReviews] = useState<Record<string, ReviewState>>(() =>
    getReviewsCache()
  );
  const [activity, setActivity] = useState<Record<string, DayActivity>>(() =>
    getActivity()
  );
  const [favCount, setFavCount] = useState(() => getFavorites().length);

  // tab 页常驻：每次显示时重读缓存（学习/复习返回后自动刷新）
  useDidShow(() => {
    setReviews(getReviewsCache());
    setActivity(getActivity());
    setFavCount(getFavorites().length);
  });

  const s = mySummary(reviews, activity);
  const trend = recentTrend(activity, 7);
  const dims = dimensionMastery(reviews, activity);
  const maxTrend = Math.max(1, ...trend.map((d) => d.total));
  const wrongCount = wrongWords(reviews).length;
  // 能力档案：由证据推导的掌握状态（与复习调度状态分离）
  const mastery = summarizeMastery(getEvidenceAll());

  const onMenu = (key: string) => {
    if (key === "goal") {
      Taro.navigateTo({ url: "/pages/goal/index" });
    } else if (key === "wrong") {
      Taro.navigateTo({ url: "/pages/wrongbook/index" });
    } else if (key === "favorites") {
      Taro.navigateTo({ url: "/pages/favorites/index" });
    } else if (key === "bind") {
      Taro.showModal({
        title: "账户绑定",
        content: "当前已通过微信账号登录，进度自动云端同步。第一版暂无其他绑定方式，敬请期待。",
        showCancel: false,
        confirmText: "知道了",
      });
    } else if (key === "privacy" || key === "terms" || key === "about") {
      Taro.navigateTo({ url: `/pages/legal/index?type=${key}` });
    }
  };

  return (
    <View className="my">
      {/* 头像昵称区 */}
      <View className="my__profile">
        <View className="my__avatar">
          <Text className="my__avatar-text">
            {user ? user.nickname.slice(0, 1) : "?"}
          </Text>
        </View>
        <View className="my__who">
          <Text className="my__name">
            {user ? user.nickname : loading ? "登录中…" : "未登录"}
          </Text>
          {error && (
            <Text className="my__err" onClick={login}>
              {error}（点击重试）
            </Text>
          )}
          {!user && !loading && !error && (
            <View
              className="my__login-btn"
              onClick={() => {
                Taro.navigateTo({ url: "/pages/login/index" });
              }}
            >
              <Text className="my__login-btn-text">微信一键登录</Text>
            </View>
          )}
          {user && user.nickname === DEFAULT_NICKNAME && (
            <Text
              className="my__nick-tip"
              onClick={() => {
                Taro.navigateTo({ url: "/pages/login/index" });
              }}
            >
              点击设置昵称 ✎
            </Text>
          )}
          <Text className="my__level">全部功能免费 · 已学 {s.learnedTotal} 词</Text>
        </View>
      </View>

      {/* 统计条 */}
      <View className="my__stats">
        <View className="my__stat">
          <Text className="my__stat-num">{s.learnedTotal}</Text>
          <Text className="my__stat-label">累计学习</Text>
        </View>
        <View className="my__stat">
          <Text className="my__stat-num">{mastery.verified + mastery.transferred}</Text>
          <Text className="my__stat-label">跨日已验证</Text>
        </View>
        <View className="my__stat">
          <Text className="my__stat-num">{s.dueCount}</Text>
          <Text className="my__stat-label">待复习</Text>
        </View>
        <View className="my__stat">
          <Text className="my__stat-num">{s.streak}</Text>
          <Text className="my__stat-label">连续天数</Text>
        </View>
      </View>

      {/* 能力档案（证据推导，与复习调度分离） */}
      <View className="my__card">
        <View className="my__card-head">
          <Text className="my__card-title">能力档案</Text>
          <Text className="my__card-sub">由独立作答证据推导</Text>
        </View>
        <View className="my__mastery">
          <View className="my__mastery-row">
            <Text className="my__mastery-label">{MASTERY_LABEL.transferred}</Text>
            <Text className="my__mastery-num">{mastery.transferred}</Text>
          </View>
          <View className="my__mastery-row">
            <Text className="my__mastery-label">{MASTERY_LABEL.verified}</Text>
            <Text className="my__mastery-num">{mastery.verified}</Text>
          </View>
          <View className="my__mastery-row">
            <Text className="my__mastery-label">{MASTERY_LABEL.recalled}</Text>
            <Text className="my__mastery-num">{mastery.recalled}</Text>
          </View>
          <View className="my__mastery-row">
            <Text className="my__mastery-label">{MASTERY_LABEL.exposed}</Text>
            <Text className="my__mastery-num">{mastery.exposed}</Text>
          </View>
        </View>
        <Text className="my__mastery-note">
          稳定可用 = 无提示独立提取 ≥3 次（≥2 次跨日、跨度 ≥7 天）且覆盖 ≥2 种情境。看卡片、选对选择题、照抄参考都不计入。口语暂无评估能力，未显示不代表达标。
        </Text>
      </View>

      {/* 最近 7 天学习趋势 */}
      <View className="my__card">
        <View className="my__card-head">
          <Text className="my__card-title">最近 7 天学习量</Text>
          <Text className="my__card-sub">新学 + 复习 · 共 {s.studyDays} 天</Text>
        </View>
        <View className="my__trend">
          {trend.map((d) => (
            <View key={d.date} className="my__trend-col">
              <View className="my__trend-barzone">
                <View
                  className="my__trend-bar"
                  style={
                    d.total
                      ? `height: ${Math.max(8, Math.round((d.total / maxTrend) * 100))}%`
                      : "height: 0"
                  }
                />
              </View>
              <Text className="my__trend-num">{d.total || ""}</Text>
              <Text className="my__trend-date">{d.date.slice(3)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 5D 五维掌握情况 */}
      <View className="my__card">
        <View className="my__card-head">
          <Text className="my__card-title">五维掌握情况</Text>
          <Text className="my__card-sub">5D 学习法</Text>
        </View>
        <View className="my__dims">
          {dims.map((d) => (
            <View key={d.key} className="my__dim">
              <View className="my__dim-head">
                <Text className="my__dim-label">{d.label}</Text>
                <Text className="my__dim-val">
                  {d.pct === null ? "—" : `${d.pct}%`}
                </Text>
              </View>
              <View className="my__dim-track">
                <View
                  className="my__dim-fill"
                  style={`width: ${d.pct ?? 0}%`}
                />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 菜单 */}
      <View className="my__menu">
        {MENU.map((item) => (
          <View
            key={item.key}
            className="my__menu-item"
            onClick={() => onMenu(item.key)}
          >
            <View className="my__menu-left">
              <Text className="my__menu-label">{item.label}</Text>
              {item.badge && (
                <Text className="my__menu-badge">{item.badge}</Text>
              )}
            </View>
            <View className="my__menu-right">
              {item.countKey === "wrong" && wrongCount > 0 && (
                <Text className="my__menu-count my__menu-count--warn">
                  {wrongCount}
                </Text>
              )}
              {item.countKey === "favorites" && favCount > 0 && (
                <Text className="my__menu-count">{favCount}</Text>
              )}
              <Text className="my__menu-arrow">{item.arrow ? "›" : ""}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text className="my__footer">沃天澜 · learn.xiyuzero.com</Text>
    </View>
  );
}
