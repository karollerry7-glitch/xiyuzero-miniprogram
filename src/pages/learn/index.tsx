// 首页「学习」— 只回答一个问题：今天该学什么？
// Phase 2：CTA 接入 5D 学习会话（pages/session）
import { useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { useAuth } from "../../services/auth";
import { localOverview, TodayOverview } from "../../services/units";
import { getTodayActivity } from "../../utils/storage";
import { EmptyState, ErrorState, Loading } from "../../components/states";
import "./index.scss";

export default function LearnPage() {
  const { user, loading, error, login } = useAuth();
  const [ov, setOv] = useState<TodayOverview>(() => localOverview());
  const [today, setToday] = useState(() => getTodayActivity());

  // 从会话页返回时刷新概览（tab 页常驻，useDidShow 是 Taro 的 onShow）
  useDidShow(() => {
    setOv(localOverview());
    setToday(getTodayActivity());
  });

  const startSession = () => {
    Taro.navigateTo({ url: "/pages/session/index" });
  };

  const finished = ov.newToday >= ov.dailyGoal;

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
                <Text className="card__denom"> / {ov.dailyGoal}</Text>
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
              ? "随时可以提前学更多，或去复习巩固"
              : "5D 五步法 · 发音 → 含义 → 语法 → 词块 → 例句"}
          </Text>
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
