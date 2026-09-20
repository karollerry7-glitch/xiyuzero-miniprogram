import { View, Text } from "@tarojs/components";
import "./states.scss";

export function Loading({ text = "加载中…" }: { text?: string }) {
  return (
    <View className="xz-state">
      <View className="xz-state__spinner" />
      <Text className="xz-state__text">{text}</Text>
    </View>
  );
}

export function EmptyState({
  icon = "🌤",
  title,
  desc,
}: {
  icon?: string;
  title: string;
  desc?: string;
}) {
  return (
    <View className="xz-state">
      <Text className="xz-state__icon">{icon}</Text>
      <Text className="xz-state__title">{title}</Text>
      {desc && <Text className="xz-state__text">{desc}</Text>}
    </View>
  );
}

export function ErrorState({
  title = "出错了",
  desc,
  onRetry,
}: {
  title?: string;
  desc?: string;
  onRetry?: () => void;
}) {
  return (
    <View className="xz-state">
      <Text className="xz-state__icon">⚠️</Text>
      <Text className="xz-state__title">{title}</Text>
      {desc && <Text className="xz-state__text">{desc}</Text>}
      {onRetry && (
        <View className="xz-state__btn" onClick={onRetry}>
          重试
        </View>
      )}
    </View>
  );
}
