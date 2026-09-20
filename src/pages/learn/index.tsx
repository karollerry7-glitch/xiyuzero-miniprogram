// 首页「学习」— 只回答一个问题：今天该学什么？
// Phase 1 骨架：登录态 + 概览卡 + CTA（学习流程 Phase 2 接入）
import { View, Text, Button } from "@tarojs/components";
import { useAuth } from "../../services/auth";
import { localOverview, TodayOverview } from "../../services/units";
import { EmptyState, ErrorState, Loading } from "../../components/states";
import "./index.scss";

export default function LearnPage() {
  const { user, loading, error, login } = useAuth();
  const ov: TodayOverview = localOverview();

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
            <Text className="card__pill">
              {ov.currentLevelName} 进度 {ov.currentLevelPct}%
            </Text>
          </View>
        </View>
      )}

      {/* 主 CTA（底部可触达区域） */}
      {!loading && !error && (
        <View className="cta-zone">
          <Button
            className="btn btn--primary"
            disabled
            onClick={() => {
              /* Phase 2：进入 5D 学习会话 */
            }}
          >
            继续学习 →
          </Button>
          <Text className="cta-zone__hint">
            5D 学习流程将在下一阶段接入
          </Text>
        </View>
      )}

      {/* 数据未同步提示（骨架期） */}
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
