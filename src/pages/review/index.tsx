// 复习页 — 回答：今天需要复习什么？入口 → review-session（Phase 3 已接通）
import { View, Text, Button } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { localOverview } from "../../services/units";
import { EmptyState } from "../../components/states";
import "./index.scss";

export default function ReviewPage() {
  // useDidShow：从复习会话返回时刷新到期数
  const [, force] = useState(0);
  useDidShow(() => force((n) => n + 1));

  const ov = localOverview();
  const hasDue = ov.dueCount > 0;

  const startReview = () => {
    Taro.navigateTo({ url: "/pages/review-session/index" });
  };

  return (
    <View className="page">
      <View className="greet">
        <Text className="greet__hello">今日待复习</Text>
        <Text className="greet__sub">智能间隔重复 · 记得住才是真的会</Text>
      </View>

      {hasDue ? (
        <View className="card">
          <Text className="review__count">{ov.dueCount}</Text>
          <Text className="review__eta">预计 {Math.max(1, Math.ceil(ov.dueCount / 6))} 分钟</Text>
          <Button className="btn btn--primary" onClick={startReview}>
            开始复习
          </Button>
        </View>
      ) : (
        <EmptyState
          icon="🎉"
          title="今日复习完成"
          desc="明天再来，SRS 会为你安排下一次复习"
        />
      )}
    </View>
  );
}
