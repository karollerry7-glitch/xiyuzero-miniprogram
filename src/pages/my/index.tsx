// 我的页 — 用户信息 + 学习统计（Phase 4）
// 数据全部来自既有 reviews / activity 缓存（云端同步后本地渲染），不重写学习逻辑
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { View, Text } from "@tarojs/components";
import { useAuth } from "../../services/auth";
import { getCachedMembership } from "../../services/membership";
import { dimensionMastery, mySummary, recentTrend } from "../../shared/stats";
import { getActivity, getReviewsCache } from "../../utils/storage";
import type { DayActivity, ReviewState } from "../../shared/types";
import "./index.scss";

const MENU = [
  { key: "goal", label: "学习目标", arrow: true },
  { key: "membership", label: "会员", arrow: true, badge: "PRO" },
  { key: "wrong", label: "错词本", arrow: true },
  { key: "favorites", label: "收藏", arrow: true },
  { key: "bind", label: "账户绑定", arrow: true },
  { key: "privacy", label: "隐私政策", arrow: true },
  { key: "terms", label: "用户协议", arrow: true },
  { key: "about", label: "关于西语Zero", arrow: true },
];

export default function MyPage() {
  const { user, loading, error, login } = useAuth();

  const [reviews, setReviews] = useState<Record<string, ReviewState>>(() =>
    getReviewsCache()
  );
  const [activity, setActivity] = useState<Record<string, DayActivity>>(() =>
    getActivity()
  );

  // tab 页常驻：每次显示时重读缓存（学习/复习返回后自动刷新）
  useDidShow(() => {
    setReviews(getReviewsCache());
    setActivity(getActivity());
  });

  const m = getCachedMembership();
  const s = mySummary(reviews, activity);
  const trend = recentTrend(activity, 7);
  const dims = dimensionMastery(reviews, activity);
  const maxTrend = Math.max(1, ...trend.map((d) => d.total));

  const onMenu = (key: string) => {
    if (key === "membership") {
      Taro.navigateTo({ url: "/pages/membership/index" });
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
          <Text className="my__level">
            {m.isPro ? "PRO 会员" : "FREE · 每日 5 个新词"} · 已学 {s.learnedTotal} 词
          </Text>
        </View>
        {m.isPro ? (
          <Text className="my__plan my__plan--pro">PRO</Text>
        ) : (
          <Text className="my__plan">FREE</Text>
        )}
      </View>

      {/* 统计条 */}
      <View className="my__stats">
        <View className="my__stat">
          <Text className="my__stat-num">{s.learnedTotal}</Text>
          <Text className="my__stat-label">累计学习</Text>
        </View>
        <View className="my__stat">
          <Text className="my__stat-num">{s.mastered}</Text>
          <Text className="my__stat-label">已掌握</Text>
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
              {"badge" in item && item.badge && (
                <Text className="my__menu-badge">{item.badge}</Text>
              )}
            </View>
            <Text className="my__menu-arrow">{item.arrow ? "›" : ""}</Text>
          </View>
        ))}
      </View>

      <Text className="my__footer">西语Zero · learn.xiyuzero.com</Text>
    </View>
  );
}
