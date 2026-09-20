// 会员页 — Free / Pro 套餐展示（Phase 4 第一版）
// 不接真实支付：购买按钮禁用，占位提示"支付功能即将上线"
// 所有价格 / 额度 / 权益均来自 config/membership.ts（统一配置）
import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import {
  PLAN_FEATURES,
  PRICING_PLANS,
  TOTAL_UNITS,
} from "../../config/membership";
import {
  fetchMembership,
  getCachedMembership,
  MembershipView,
} from "../../services/membership";
import { Loading } from "../../components/states";
import "./index.scss";

export default function MembershipPage() {
  const [m, setM] = useState<MembershipView>(() => getCachedMembership());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMembership()
      .then(setM)
      .catch(() => {
        // 离线：保持缓存视图（Entitlement 层兜底 Free）
      })
      .finally(() => setLoading(false));
  }, []);

  const back = () => {
    Taro.navigateBack({
      fail: () => Taro.switchTab({ url: "/pages/my/index" }),
    });
  };

  return (
    <View className="member">
      {/* 顶栏 */}
      <View className="member__topbar">
        <Text className="member__back" onClick={back}>
          ←
        </Text>
        <Text className="member__title">西语Zero Pro</Text>
        <Text className="member__topbar-ph" />
      </View>

      {/* 当前状态 */}
      <View className="member__current">
        {loading && <Loading text="正在获取会员状态…" />}
        {!loading && (
          <View>
            <Text className="member__current-plan">
              {m.isPro ? "PRO 会员" : "FREE 免费版"}
            </Text>
            <Text className="member__current-desc">
              {m.isPro
                ? m.billingCycle === "lifetime"
                  ? "终身会员 · 感谢支持"
                  : `有效期至 ${m.proUntil?.slice(0, 10) ?? "—"}`
                : `已解锁 Starter + A1 词库 · 每日可学 ${m.entitlements.dailyNewLimit} 个新词`}
            </Text>
          </View>
        )}
      </View>

      {!loading && !m.isPro && (
        <View>
          {/* 价格卡片 */}
          <View className="member__plans">
            {PRICING_PLANS.map((p) => (
              <View
                key={p.key}
                className={`member__plan ${p.recommended ? "member__plan--rec" : ""}`}
              >
                {p.recommended && (
                  <Text className="member__plan-badge">推荐</Text>
                )}
                <Text className="member__plan-name">{p.name}</Text>
                <Text className="member__plan-price">
                  <Text className="member__plan-cur">¥</Text>
                  {p.price}
                </Text>
                {p.perMonth && (
                  <Text className="member__plan-permonth">
                    约 ¥{p.perMonth} / 月
                  </Text>
                )}
                <Text className="member__plan-note">{p.note}</Text>
              </View>
            ))}
          </View>

          {/* 权益对比 */}
          <View className="member__compare">
            <View className="member__compare-head">
              <Text className="member__compare-col">权益</Text>
              <Text className="member__compare-col">FREE</Text>
              <Text className="member__compare-col member__compare-col--pro">
                PRO
              </Text>
            </View>
            {PLAN_FEATURES.map((f) => (
              <View key={f.label} className="member__compare-row">
                <Text className="member__compare-label">{f.label}</Text>
                <Text className="member__compare-val">{f.free}</Text>
                <Text className="member__compare-val member__compare-val--pro">
                  {f.pro}
                </Text>
              </View>
            ))}
          </View>

          {/* 购买（第一版禁用占位） */}
          <View className="member__buy">
            <Button className="member__buy-btn" disabled>
              支付功能即将上线
            </Button>
            <Text className="member__buy-hint">
              第一版暂不支持购买 · 上线后解锁全部 {TOTAL_UNITS} 词
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
