// 我的页 — 用户信息 + 菜单入口（统计/错词/收藏/会员 Phase 4-6 接入）
import { View, Text } from "@tarojs/components";
import { useAuth } from "../../services/auth";
import { localOverview } from "../../services/units";
import "./index.scss";

const MENU = [
  { key: "goal", label: "学习目标", arrow: true },
  { key: "stats", label: "学习统计", arrow: true },
  { key: "wrong", label: "错词本", arrow: true },
  { key: "favorites", label: "收藏", arrow: true },
  { key: "membership", label: "会员", arrow: true },
  { key: "bind", label: "账户绑定", arrow: true },
  { key: "privacy", label: "隐私政策", arrow: true },
  { key: "terms", label: "用户协议", arrow: true },
  { key: "about", label: "关于西语Zero", arrow: true },
];

export default function MyPage() {
  const { user, loading, error, login } = useAuth();
  const ov = localOverview();

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
            {ov.currentLevelName} · 已学 {ov.learnedTotal} 词
          </Text>
        </View>
        <Text className="my__plan">FREE</Text>
      </View>

      {/* 统计条 */}
      <View className="my__stats">
        <View className="my__stat">
          <Text className="my__stat-num">{ov.streak}</Text>
          <Text className="my__stat-label">连续天数</Text>
        </View>
        <View className="my__stat">
          <Text className="my__stat-num">{ov.learnedTotal}</Text>
          <Text className="my__stat-label">已学词汇</Text>
        </View>
        <View className="my__stat">
          <Text className="my__stat-num">{ov.dueCount}</Text>
          <Text className="my__stat-label">待复习</Text>
        </View>
      </View>

      {/* 菜单 */}
      <View className="my__menu">
        {MENU.map((m) => (
          <View key={m.key} className="my__menu-item">
            <Text className="my__menu-label">{m.label}</Text>
            <Text className="my__menu-arrow">{m.arrow ? "›" : ""}</Text>
          </View>
        ))}
      </View>

      <Text className="my__footer">西语Zero · learn.xiyuzero.com</Text>
    </View>
  );
}
