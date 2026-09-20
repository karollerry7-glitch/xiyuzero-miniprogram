// 复习页 — 只回答：今天需要复习什么？（复习引擎 Phase 3 接入）
import { View, Text, Button } from "@tarojs/components";
import { localOverview } from "../../services/units";
import { EmptyState } from "../../components/states";
import "./index.scss";

export default function ReviewPage() {
  const ov = localOverview();
  const hasDue = ov.dueCount > 0;

  return (
    <View className="page">
      <View className="greet">
        <Text className="greet__hello">今日待复习</Text>
        <Text className="greet__sub">智能间隔重复 · 记得住才是真的会</Text>
      </View>

      {hasDue ? (
        <View className="card">
          <Text className="review__count">{ov.dueCount}</Text>
          <Text className="review__eta">预计 8 分钟</Text>
          <Button
            className="btn btn--primary"
            disabled
            onClick={() => {
              /* Phase 3：开始复习会话 */
            }}
          >
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
