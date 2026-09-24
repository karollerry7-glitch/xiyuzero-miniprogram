// 首页「学习」— 只回答一个问题：今天该学什么？
// Phase 2：CTA 接入 5D 学习会话（pages/session）
// 审核整改：游客优先 — 首次进入直接看首页，可体验 5D 学习；
//           登录入口仅由用户主动点击触发，不再自动跳转登录页。
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
import { EmptyState } from "../../components/states";
import "./index.scss";

export default function LearnPage() {
  const { user, refresh } = useAuth();
  const [ov, setOv] = useState<TodayOverview>(() => localOverview());
  const [today, setToday] = useState(() => getTodayActivity());

  // 从会话页返回时刷新概览（tab 页常驻，useDidShow 是 Taro 的 onShow）
  useDidShow(() => {
    setOv(localOverview());
    setToday(getTodayActivity());
    refresh(); // 从登录页返回等场景同步用户昵称
  });

  // Entitlement 层：每日目标（Free 每日 10 词，Pro 用用户设置）
  const member = getCachedMembership();
  const dailyGoal = effectiveDailyGoal(member, ov.dailyGoal);

  const startSession = () => {
    Taro.navigateTo({ url: "/pages/session/index" });
  };

  const goLogin = () => {
    Taro.navigateTo({ url: "/pages/login/index" });
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
        <Text className="greet__sub">
          {user ? "今天继续学习" : "游客模式 · 学习记录保存在本机"}
        </Text>
      </View>

      {/* 今日目标卡 */}
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

      {/* 主 CTA：游客与登录用户一致，均可直接体验 5D 学习 */}
      <View className="cta-zone">
        <Button className="btn btn--primary" onClick={startSession}>
          {finished ? "今日任务完成 🎉" : "先体验 5D 学习 →"}
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

      {/* 游客登录入口：用户主动点击才进入登录页 */}
      {!user && (
        <View className="card card--guest" onClick={goLogin}>
          <View className="card__guest-main">
            <Text className="card__guest-title">登录并同步进度</Text>
            <Text className="card__guest-desc">
              免费注册 · 云端备份学习记录，换机不丢失
            </Text>
          </View>
          <Text className="card__guest-arrow">›</Text>
        </View>
      )}

      {/* 今日会话小结（学过之后显示） */}
      {today.recallTotal > 0 && (
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
      {ov.learnedTotal === 0 && (
        <EmptyState
          icon="🇪🇸"
          title="从这里开始你的西语之旅"
          desc="系统掌握 4505 个核心词汇，为达到 CEFR B2 建立扎实的词汇基础"
        />
      )}
    </View>
  );
}
