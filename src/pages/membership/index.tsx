// 会员页 — Free / Pro 套餐展示 + 购买流程
// 购买链路已就绪：createOrder → wx.requestPayment → 轮询订单 → 刷新会员
// 服务端未配置商户号时返回 501，本页以「即将上线」弹窗承接（第一版体验）
// 所有价格 / 额度 / 权益均来自 config/membership.ts（统一配置）
import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import {
  BillingCycle,
  PLAN_FEATURES,
  PRICING_PLANS,
  TOTAL_UNITS,
} from "../../config/membership";
import {
  fetchMembership,
  getCachedMembership,
  MembershipView,
  createOrder,
  queryOrder,
  PaymentUnavailableError,
} from "../../services/membership";
import { Loading } from "../../components/states";
import "./index.scss";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function MembershipPage() {
  const [m, setM] = useState<MembershipView>(() => getCachedMembership());
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<BillingCycle | null>(null);

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

  /** 购买：下单 → 调起支付 → 轮询订单 → 刷新会员状态 */
  const buy = async (cycle: BillingCycle) => {
    if (buying) return;
    setBuying(cycle);
    try {
      let order;
      try {
        order = await createOrder(cycle);
      } catch (e) {
        if (e instanceof PaymentUnavailableError) {
          Taro.showModal({
            title: "支付功能即将上线",
            content: "当前版本暂未开放购买，敬请期待",
            showCancel: false,
          });
          return;
        }
        throw e;
      }

      // 调起微信支付（用户取消会 reject，errMsg 含 cancel）
      await Taro.requestPayment({
        timeStamp: order.payParams.timeStamp,
        nonceStr: order.payParams.nonceStr,
        package: order.payParams.package,
        signType: order.payParams.signType,
        paySign: order.payParams.paySign,
      });

      // 支付完成 → 轮询订单（回调结算有秒级延迟，最多 6 次）
      let paid = false;
      for (let i = 0; i < 6; i++) {
        await sleep(1000);
        try {
          const st = await queryOrder(order.orderId);
          if (st.status === "paid") {
            paid = true;
            break;
          }
          if (st.status === "closed") break;
        } catch {
          /* 网络抖动继续轮询 */
        }
      }

      const view = await fetchMembership();
      setM(view);
      if (view.isPro) {
        Taro.showToast({ title: "开通成功 🎉", icon: "success" });
      } else if (paid) {
        Taro.showToast({ title: "已支付，权益开通中…", icon: "none" });
      }
    } catch (e) {
      const msg = (e as { errMsg?: string })?.errMsg || "";
      if (msg.includes("cancel")) {
        Taro.showToast({ title: "已取消支付", icon: "none" });
      } else {
        Taro.showToast({ title: "支付未完成，请稍后重试", icon: "none" });
      }
    } finally {
      setBuying(null);
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
                <Button
                  className={`member__buy-btn member__buy-btn--card ${
                    buying === p.key ? "member__buy-btn--busy" : ""
                  }`}
                  disabled={buying !== null}
                  loading={buying === p.key}
                  onClick={() => buy(p.key)}
                >
                  {buying === p.key ? "正在下单…" : "立即开通"}
                </Button>
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

          {/* 说明 */}
          <View className="member__buy">
            <Text className="member__buy-hint">
              购买后立即生效 · 解锁全部 {TOTAL_UNITS} 词 · 续费自动叠加剩余时长
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
