// 会员页 — 2026-10-22 收费会员已移除
// 本页保留路由（旧版本分享链接/深链直达不 404），内容改为免费公告。
// 原 Pro 付费、兑换码激活、客服购买链路全部下线。
import { View, Text, Button } from "@tarojs/components";
import Taro, { useShareAppMessage, useShareTimeline } from "@tarojs/taro";
import { SHARE_TITLE, SHARE_PATH, ensureShareMenu } from "../../shared/share";
import { TOTAL_UNITS } from "../../config/membership";
import "./index.scss";

const FEATURES = [
  { icon: "📚", label: `全部 ${TOTAL_UNITS} 词库`, desc: "Starter 到 B2 全等级开放" },
  { icon: "♾️", label: "每日新词不限量", desc: "按自己的节奏学，仅受自设目标约束" },
  { icon: "🧠", label: "5D 五步法 + 间隔复习", desc: "智能复习与小测全部开放" },
  { icon: "📊", label: "完整学习统计", desc: "五维掌握 + 能力档案" },
  { icon: "☁️", label: "云端同步", desc: "学习记录换机不丢失" },
];

export default function MembershipPage() {
  // 转发与分享（全页面统一）
  useShareAppMessage(() => ({ title: SHARE_TITLE, path: SHARE_PATH }));
  useShareTimeline(() => ({ title: SHARE_TITLE }));
  ensureShareMenu();
  const goHome = () => {
    Taro.switchTab({ url: "/pages/learn/index" });
  };

  return (
    <View className="membership membership--free">
      <View className="free-hero">
        <Text className="free-hero__icon">🎉</Text>
        <Text className="free-hero__title">全部功能已免费开放</Text>
        <Text className="free-hero__sub">
          沃天澜·西语已取消收费会员。所有学习功能对每位用户完全开放，无需付费。
        </Text>
      </View>

      <View className="free-list">
        {FEATURES.map((f) => (
          <View className="free-list__item" key={f.label}>
            <Text className="free-list__icon">{f.icon}</Text>
            <View className="free-list__main">
              <Text className="free-list__label">{f.label}</Text>
              <Text className="free-list__desc">{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="free-note">
        <Text className="free-note__text">
          此前已是 Pro 的用户不受影响，全部功能继续可用。
          如有疑问可通过「关于沃天澜」页联系我们。
        </Text>
      </View>

      <View className="free-actions">
        <Button className="btn-main" onClick={goHome}>
          开始学习 →
        </Button>
      </View>
    </View>
  );
}
