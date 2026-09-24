// 微信登录页（两步）：① 微信一键登录（静默授权 wx.login）② 昵称填写（input type=nickname）
// 进入路径：① 首次启动未登录时从「学习」页引导进入 ②「我的」页登录/改昵称入口
import { useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Input } from "@tarojs/components";
import { ensureLogin, updateNickname } from "../../services/auth";
import { syncNow } from "../../services/sync";
import { getLastMutation, getLastSynced, getPendingEvents } from "../../utils/storage";
import { DEFAULT_NICKNAME } from "../../config/membership";
import "./index.scss";

const KEY_LOGIN_SKIPPED = "xz_login_skipped";
// 协议同意记录：版本 + 时间（合规：主动勾选才记录，不勾选不得视为同意）
const KEY_LEGAL_CONSENT = "xz_legal_consent";
const LEGAL_VERSION = "1.0";

/** 读取协议同意记录（版本 + 同意时间） */
export function getLegalConsent(): { version: string; agreedAt: number } | null {
  try {
    const raw = Taro.getStorageSync(KEY_LEGAL_CONSENT);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (rec && rec.version && rec.agreedAt) return rec;
    return null;
  } catch {
    return null;
  }
}

function recordLegalConsent(): void {
  try {
    Taro.setStorageSync(
      KEY_LEGAL_CONSENT,
      JSON.stringify({ version: LEGAL_VERSION, agreedAt: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export default function LoginPage() {
  // step: login 一键登录 / nickname 昵称填写
  const [step, setStep] = useState<"login" | "nickname">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [nick, setNick] = useState("");
  // 协议勾选：初始必须为未勾选（false），不得默认同意
  const [agreed, setAgreed] = useState(false);

  // 已登录用户进入本页：
  //   - 昵称仍是默认（西语学员）→ 停留并进入昵称步骤（my 页「改昵称」入口）
  //   - 昵称已设置 → 防呆弹回首页
  useDidShow(() => {
    try {
      const u = Taro.getStorageSync("xz_user");
      const token = Taro.getStorageSync("xz_token");
      if (u && token) {
        let nickname = "";
        try {
          nickname = JSON.parse(u)?.nickname ?? "";
        } catch {
          /* ignore */
        }
        if (nickname && nickname !== DEFAULT_NICKNAME) {
          Taro.switchTab({ url: "/pages/learn/index" });
        } else {
          setStep("nickname");
        }
      }
    } catch {
      /* ignore */
    }
  });

  const backHome = (delay = 300) => {
    setTimeout(() => {
      Taro.switchTab({ url: "/pages/learn/index" });
    }, delay);
  };

  const onLogin = async () => {
    if (loading || done) return;
    // 合规：未勾选协议时拦截登录，不修改勾选状态、不得视为同意
    if (!agreed) {
      Taro.showToast({
        title: "请先阅读并勾选同意《用户协议》与《隐私政策》",
        icon: "none",
        duration: 2500,
      });
      return;
    }
    setLoading(true);
    setError(null);
    // 游客转登录：登录前快照本地是否有未同步学习记录（登录后提供明确合并选择）
    const hadLocalProgress =
      getPendingEvents().length > 0 || getLastMutation() > getLastSynced();
    try {
      const user = await ensureLogin();
      // 用户主动勾选并完成登录 → 记录同意版本与时间
      recordLegalConsent();
      // 游客期间有本地学习记录 → 提供明确合并选择，不自动覆盖
      if (hadLocalProgress) {
        Taro.showModal({
          title: "发现本机学习记录",
          content:
            "检测到你在未登录期间的学习记录。是否合并到云端账号？（合并保留两端较新的进度，可在多设备同步）",
          confirmText: "合并到账号",
          cancelText: "暂不合并",
          success: (res) => {
            if (res.confirm) {
              syncNow().catch(() => {
                /* 离线时下次自动重试 */
              });
            } else {
              try {
                Taro.setStorageSync("xz_merge_deferred", "1");
              } catch {
                /* ignore */
              }
            }
          },
        });
      }
      if (user.nickname && user.nickname !== DEFAULT_NICKNAME) {
        // 老用户已设置昵称 → 直接完成
        setDone(true);
        Taro.showToast({ title: "欢迎回来", icon: "success" });
        backHome(700);
      } else {
        // 新用户 → 进入昵称填写
        setStep("nickname");
      }
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

  const onSkipLogin = () => {
    try {
      Taro.setStorageSync(KEY_LOGIN_SKIPPED, "1");
    } catch {
      /* ignore */
    }
    Taro.switchTab({ url: "/pages/learn/index" });
  };

  const onSaveNick = async () => {
    const name = nick.replace(/\s+/g, " ").trim();
    if (!name) {
      Taro.showToast({ title: "先输入昵称，或点「跳过」", icon: "none" });
      return;
    }
    if (name.length > 16) {
      Taro.showToast({ title: "昵称最多 16 个字符", icon: "none" });
      return;
    }
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await updateNickname(name);
      setDone(true);
      Taro.showToast({ title: `你好，${name}`, icon: "none" });
      backHome(700);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "保存失败，请稍后重试"
      );
    } finally {
      setLoading(false);
    }
  };

  const onSkipNick = () => {
    Taro.showToast({ title: `默认称呼：${DEFAULT_NICKNAME}`, icon: "none" });
    backHome(400);
  };

  const openLegal = (type: string) => {
    Taro.navigateTo({ url: `/pages/legal/index?type=${type}` });
  };

  // ============ 第 2 步：昵称填写 ============
  if (step === "nickname") {
    return (
      <View className="login">
        <View className="login__brand">
          <View className="login__logo">
            <Text className="login__logo-text">沃</Text>
          </View>
          <Text className="login__title">怎么称呼你？</Text>
          <Text className="login__es">¿Cómo te llamas?</Text>
          <Text className="login__sub">
            只用于学习页问候与打卡海报，随时可在「我的」页修改
          </Text>
        </View>

        <View className="login__actions">
          <Input
            className="login__input"
            type="nickname"
            value={nick}
            placeholder="点击键盘上方可快速填入微信昵称"
            maxlength={16}
            onInput={(e) => setNick(e.detail.value)}
          />
          {error && <Text className="login__err">{error}（点击重试）</Text>}
          <View
            className={`login__btn ${loading ? "login__btn--loading" : ""}`}
            onClick={onSaveNick}
          >
            <Text className="login__btn-text">
              {loading ? "保存中…" : done ? "✓ 已保存" : "就叫我这个"}
            </Text>
          </View>
          <Text className="login__skip" onClick={onSkipNick}>
            跳过，稍后再说
          </Text>
        </View>

        <View className="login__legal">
          <Text className="login__legal-text">昵称仅保存在你的学习账号中</Text>
        </View>
      </View>
    );
  }

  // ============ 第 1 步：微信一键登录 ============
  return (
    <View className="login">
      {/* 品牌 */}
      <View className="login__brand">
        <View className="login__logo">
          <Text className="login__logo-text">沃</Text>
        </View>
        <Text className="login__title">沃天澜</Text>
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

        <Text className="login__skip" onClick={onSkipLogin}>
          暂不登录，先逛逛
        </Text>
      </View>

      {/* 协议：主动勾选（初始未勾选），两份协议可分别打开阅读 */}
      <View className="login__legal">
        <View
          className={`login__check ${agreed ? "login__check--on" : ""}`}
          onClick={() => setAgreed(!agreed)}
        >
          <Text className="login__check-mark">{agreed ? "✓" : ""}</Text>
        </View>
        <Text className="login__legal-text">
          已阅读并同意{" "}
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
