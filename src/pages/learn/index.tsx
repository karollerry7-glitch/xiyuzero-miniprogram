// 首页「学习」— 只回答一个问题：今天该学什么？
// Phase 2：CTA 接入 5D 学习会话（pages/session）
import { useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { useAuth } from "../../services/auth";
import { localOverview, TodayOverview } from "../../services/units";
import { getTodayActivity } from "../../utils/storage";
import {
  effectiveDailyGoal,
  getCachedMembership,
} from "../../services/membership";
import { EmptyState, ErrorState, Loading } from "../../components/states";
import "./index.scss";

export default function LearnPage() {
  const { user, loading, error, login, refresh } = useAuth();
  const [ov, setOv] = useState<TodayOverview>(() => localOverview());
  const [today, setToday] = useState(() => getTodayActivity());

  // 从会话页返回时刷新概览（tab 页常驻，useDidShow 是 Taro 的 onShow）
  useDidShow(() => {
    setOv(localOverview());
    setToday(getTodayActivity());
    refresh(); // 从登录页返回等场景同步用户昵称

    // 首次启动未登录 → 引导去登录页（延时等待 App 静默登录结果；
    // 已跳过或已登录则不再打扰；离开本页后不重复弹）
    setTimeout(() => {
      try {
        const user = Taro.getStorageSync("xz_user");
        const token = Taro.getStorageSync("xz_token");
        const skipped = Taro.getStorageSync("xz_login_skipped");
        const pages = Taro.getCurrentPages();
        const onLearn =
          pages.length > 0 &&
          pages[pages.length - 1].route === "pages/learn/index";
        if (!user && !token && !skipped && onLearn) {
          Taro.navigateTo({ url: "/pages/login/index" });
        }
      } catch {
        /* ignore */
      }
    }, 1500);
  });

  // Entitlement 层：每日目标（Free 被限制在 5，Pro 用用户设置）
  const member = getCachedMembership();
  const dailyGoal = effectiveDailyGoal(member, ov.dailyGoal);

  const startSession = () => {
    Taro.navigateTo({ url: "/pages/session/index" });
  };

  const finished = ov.newToday >= dailyGoal;

  const goMembership = () => {
    Taro.navigateTo({ url: "/pages/membership/index" });
  };

  return (
    <View className="page">
      {/* 问候 */}
      <View className="greet">
        <Text className="greet__hello">
          你好，{user ? user.nickname : "西语学员"}
        </Text>
        <Text className="greet__sub">今天继续学习</Text>
      </View>

      {/* 登录态 */}
      {loading && <Loading text="正在登录…" />}
      {error && <ErrorState title="登录失败" desc={error} onRetry={login} />}

      {/* 今日目标卡 */}
      {!loading && !error && (
        <View className="card card--hero">
          <View className="card__row">
            <View className="card__metric">
              <Text className="card__num">
                {ov.newToday}
                <Text className="card__denom"> / {dailyGoal}</Text>
              </Text>
              <Text className="card__label">今日新词</Text>
            </View>
            <View className="card__metric">
              <Text className="card__num">{ov.dueCount}</Text>
              <Text className="card__label">待复习</Text>
            </View>
          </View>
          <View className="card__row card__row--sub">
            <Text className="card__pill">🔥 连续学习 {ov.streak} 天</Text>
            <Text className="card__pill">已掌握 {ov.learnedTotal} 词</Text>
          </View>
        </View>
      )}

      {/* 主 CTA */}
      {!loading && !error && (
        <View className="cta-zone">
          <Button className="btn btn--primary" onClick={startSession}>
            {finished ? "今日任务完成 🎉" : "继续学习 →"}
          </Button>
          <Text className="cta-zone__hint">
            {finished
              ? member.isPro
                ? "随时可以提前学更多，或去复习巩固"
                : "随时可以复习巩固 · 明天再学新词"
              : "5D 五步法 · 发音 → 含义 → 语法 → 词块 → 例句"}
          </Text>
          {/* Free 用户学完当日额度：自然升级提示 */}
          {finished && !member.isPro && (
            <Text className="cta-zone__upgrade" onClick={goMembership}>
              升级 Pro，每日不限新词 ›
            </Text>
          )}
        </View>
      )}

      {/* 今日会话小结（学过之后显示） */}
      {!loading && !error && today.recallTotal > 0 && (
        <View className="card">
          <Text className="summary__title">今日回忆练习</Text>
          <Text className="summary__line">
            {today.recallCorrect} / {today.recallTotal} 次完全正确
            {today.wrongIds.length > 0
              ? ` · ${today.wrongIds.length} 个待加强`
              : " · 全部过关"}
          </Text>
        </View>
      )}

      {/* 新用户引导 */}
      {!loading && !error && ov.learnedTotal === 0 && (
        <EmptyState
          icon="🇪🇸"
          title="从这里开始你的西语之旅"
          desc="系统掌握 4505 个核心词汇，为达到 CEFR B2 建立扎实的词汇基础"
        />
      )}
    </View>
  );
}
