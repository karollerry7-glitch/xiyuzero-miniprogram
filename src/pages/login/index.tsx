// 微信登录页 — 品牌视觉 + 微信一键登录（静默授权 wx.login，无需用户输密码）
// 进入路径：① 首次启动未登录时从「学习」页引导进入 ②「我的」页登录按钮
import { useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text } from "@tarojs/components";
import { ensureLogin } from "../../services/auth";
import "./index.scss";

const KEY_LOGIN_SKIPPED = "xz_login_skipped";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 已登录用户误入本页 → 直接回首页（防呆）
  useDidShow(() => {
    try {
      const u = Taro.getStorageSync("xz_user");
      const token = Taro.getStorageSync("xz_token");
      if (u && token) {
        Taro.switchTab({ url: "/pages/learn/index" });
      }
    } catch {
      /* ignore */
    }
  });

  const onLogin = async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      await ensureLogin();
      setDone(true);
      Taro.showToast({ title: "登录成功", icon: "success" });
      setTimeout(() => {
        Taro.switchTab({ url: "/pages/learn/index" });
      }, 700);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "登录失败，请检查网络后重试（体验版需在右上角开启调试模式）"
      );
    } finally {
      setLoading(false);
    }
  };

  const onSkip = () => {
    try {
      Taro.setStorageSync(KEY_LOGIN_SKIPPED, "1");
    } catch {
      /* ignore */
    }
    Taro.switchTab({ url: "/pages/learn/index" });
  };

  const openLegal = (type: string) => {
    Taro.navigateTo({ url: `/pages/legal/index?type=${type}` });
  };

  return (
    <View className="login">
      {/* 品牌 */}
      <View className="login__brand">
        <View className="login__logo">
          <Text className="login__logo-text">Z</Text>
        </View>
        <Text className="login__title">西语ZERO</Text>
        <Text className="login__es">Español desde cero</Text>
        <Text className="login__sub">从零开始的西班牙语词汇宇宙</Text>
      </View>

      {/* 操作区 */}
      <View className="login__actions">
        {done ? (
          <View className="login__btn login__btn--done">
            <Text className="login__btn-text">✓ 登录成功</Text>
          </View>
        ) : (
          <View
            className={`login__btn ${loading ? "login__btn--loading" : ""}`}
            onClick={onLogin}
          >
            <Text className="login__btn-text">
              {loading ? "正在登录…" : "微信一键登录"}
            </Text>
          </View>
        )}

        {error && (
          <Text className="login__err" onClick={onLogin}>
            {error}（点击重试）
          </Text>
        )}

        <Text className="login__skip" onClick={onSkip}>
          暂不登录，先逛逛
        </Text>
      </View>

      {/* 协议 */}
      <View className="login__legal">
        <Text className="login__legal-text">
          登录即代表同意{" "}
          <Text
            className="login__legal-link"
            onClick={() => openLegal("terms")}
          >
            《用户协议》
          </Text>{" "}
          与{" "}
          <Text
            className="login__legal-link"
            onClick={() => openLegal("privacy")}
          >
            《隐私政策》
          </Text>
        </Text>
      </View>
    </View>
  );
}
