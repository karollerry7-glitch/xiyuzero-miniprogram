// 会员页 — Free / Pro 展示 + 开通引导（第一版售卖模式）
// 售卖链路：添加客服微信 HOME6814 购买（¥99.9 终身）→ 获得兑换码 → 本页输入激活
// 所有价格 / 额度 / 权益均来自 config/membership.ts（统一配置）
import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, Input } from "@tarojs/components";
import {
  CUSTOMER_SERVICE_WECHAT,
  PLAN_FEATURES,
  PRICING_PLANS,
  TOTAL_UNITS,
} from "../../config/membership";
import {
  fetchMembership,
  getCachedMembership,
  MembershipView,
  redeemCode,
} from "../../services/membership";
import { ApiError } from "../../services/request";
import { Loading } from "../../components/states";
import "./index.scss";

const plan = PRICING_PLANS[0]; // 唯一方案：终身 ¥99.9

export default function MembershipPage() {
  const [m, setM] = useState<MembershipView>(() => getCachedMembership());
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

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

  /** 开通引导：弹窗展示客服微信，确认即复制 */
  const onUpgrade = () => {
    Taro.showModal({
      title: "开通 Pro 终身会员",
      content: `添加客服微信购买\n\n微信号：${CUSTOMER_SERVICE_WECHAT}\n\n付款后客服将发放兑换码，\n返回本页输入兑换码即可永久激活。`,
      confirmText: "复制微信号",
      cancelText: "暂不开通",
      success: (res) => {
        if (res.confirm) {
          Taro.setClipboardData({
            data: CUSTOMER_SERVICE_WECHAT,
            success: () => {
              Taro.showToast({
                title: "已复制，去微信添加客服",
                icon: "none",
              });
            },
          });
        }
      },
    });
  };

  /** 兑换码激活 */
  const onRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      Taro.showToast({ title: "请输入兑换码", icon: "none" });
      return;
    }
    if (redeeming) return;
    setRedeeming(true);
    try {
      await redeemCode(trimmed);
      const view = await fetchMembership();
      setM(view);
      Taro.showToast({ title: "激活成功，欢迎加入 PRO 🎉", icon: "success" });
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : "激活失败，请稍后重试";
      Taro.showToast({ title: msg, icon: "none" });
    } finally {
      setRedeeming(false);
    }
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
          {/* 终身价卡片（唯一方案） */}
          <View className="member__plans">
            <View className="member__plan member__plan--rec">
              <Text className="member__plan-badge">限时买断</Text>
              <Text className="member__plan-name">{plan.name}</Text>
              <Text className="member__plan-price">
                <Text className="member__plan-cur">¥</Text>
                {plan.price}
              </Text>
              <Text className="member__plan-permonth">终身使用</Text>
              <Text className="member__plan-note">{plan.note}</Text>
              <Button
                className="member__buy-btn member__buy-btn--card"
                onClick={onUpgrade}
              >
                添加客服微信开通
              </Button>
            </View>
          </View>

          {/* 兑换码激活 */}
          <View className="member__redeem">
            <Text className="member__redeem-title">兑换码激活</Text>
            <Text className="member__redeem-desc">
              已购买？输入客服发放的兑换码，立即解锁全部功能
            </Text>
            <View className="member__redeem-row">
              <Input
                className="member__redeem-input"
                placeholder="XZ-XXXX-XXXX-XXXX"
                placeholderClass="member__redeem-ph"
                value={code}
                maxlength={20}
                onInput={(e) => setCode(e.detail.value)}
              />
              <Button
                className={`member__redeem-btn ${
                  redeeming ? "member__redeem-btn--busy" : ""
                }`}
                disabled={redeeming}
                loading={redeeming}
                onClick={onRedeem}
              >
                {redeeming ? "激活中…" : "激活 Pro"}
              </Button>
            </View>
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

          {/* 说明 */}
          <View className="member__buy">
            <Text className="member__buy-hint">
              一次买断 · 解锁全部 {TOTAL_UNITS} 词 · 支持所有后续更新
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
