// 首页「学习」— 只回答一个问题：今天该学什么？
// Phase 2：CTA 接入 5D 学习会话（pages/session）
// 审核整改：游客优先 — 首次进入直接看首页，可体验 5D 学习；
//           登录入口仅由用户主动点击触发，不再自动跳转登录页。
import { useState } from "react";
import Taro, {
  useDidShow,
  useShareAppMessage,
  useShareTimeline,
} from "@tarojs/taro";
import { ensureShareMenu } from "../../shared/share";
import { View, Text, Button } from "@tarojs/components";
import { useAuth } from "../../services/auth";
import { localOverview, TodayOverview } from "../../services/units";
import { getTodayActivity, getLastQuizDate } from "../../utils/storage";
import {
  reviewPressureBlocked,
  quizDue,
  QUIZ_INTERVAL_DAYS,
  QUIZ_SIZE,
  QUIZ_MIN_LEARNED,
} from "../../services/schedule";
import { EmptyState } from "../../components/states";
import "./index.scss";

const SHARE_TITLE = "沃天澜·西语｜5D 五步法学西语，记得住才是真的会";

export default function LearnPage() {
  const { user, refresh } = useAuth();
  const [ov, setOv] = useState<TodayOverview>(() => localOverview());
  const [today, setToday] = useState(() => getTodayActivity());

  // 转发与分享（截图问题：「当前页面不可转发/不可分享」= 页面缺分享钩子）
  useShareAppMessage(() => ({ title: SHARE_TITLE, path: "/pages/learn/index" }));
  useShareTimeline(() => ({ title: SHARE_TITLE }));
  ensureShareMenu();

  // 从会话页返回时刷新概览（tab 页常驻，useDidShow 是 Taro 的 onShow）
  useDidShow(() => {
    setOv(localOverview());
    setToday(getTodayActivity());
    refresh(); // 从登录页返回等场景同步用户昵称
  });

  // 每日目标：功能已全面免费，直接用用户自设目标
  const dailyGoal = ov.dailyGoal;

  const startSession = () => {
    Taro.navigateTo({ url: "/pages/session/index" });
  };

  const goLogin = () => {
    Taro.navigateTo({ url: "/pages/login/index" });
  };

  const finished = ov.newToday >= dailyGoal;

  // 复习压力控制：待复习超阈值 → 今日暂停新词，CTA 转为旧词巩固
  const reviewBlocked = reviewPressureBlocked(ov.dueCount);

  // 复习小测（检索练习）：每 3 天一次，学满 QUIZ_MIN_LEARNED 词后出现
  const quizAvailable =
    ov.learnedTotal >= QUIZ_MIN_LEARNED && quizDue(getLastQuizDate());

  const goQuiz = () => {
    Taro.navigateTo({ url: "/pages/review-session/index?mode=quiz" });
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
          <Text className="card__pill">已学 {ov.learnedTotal} 词</Text>
        </View>
      </View>

      {/* 主 CTA：游客与登录用户一致，均可直接体验 5D 学习 */}
      <View className="cta-zone">
        <Button className="btn btn--primary" onClick={startSession}>
          {finished
            ? "今日任务完成 🎉"
            : reviewBlocked
              ? "先巩固旧词 →"
              : "先体验 5D 学习 →"}
        </Button>
        <Text className="cta-zone__hint">
          {reviewBlocked && !finished
            ? `待复习 ${ov.dueCount} 个较多，今日暂停新词 · 消化后再学更牢固`
            : finished
              ? "随时可以提前学更多，或去复习巩固"
              : "5D 五步法 · 发音 → 含义 → 语法 → 词块 → 例句"}
        </Text>
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

      {/* 复习小测：遗忘曲线 · 每 3 天一次检索练习 */}
      {quizAvailable && (
        <View className="card card--guest" onClick={goQuiz}>
          <View className="card__guest-main">
            <Text className="card__guest-title">📝 复习小测</Text>
            <Text className="card__guest-desc">
              {QUIZ_INTERVAL_DAYS} 天一次检索练习 · {QUIZ_SIZE} 个词快问快答，
              在忘记之前巩固它
            </Text>
          </View>
          <Text className="card__guest-arrow">›</Text>
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
