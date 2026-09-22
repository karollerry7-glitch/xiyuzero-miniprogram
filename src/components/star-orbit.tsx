// 5D 词汇星轨 — 打卡页主视觉（可复用组件，支持任意词数目标）
// N 颗词星沿轨道环分布，中央为 "N PALABRAS"；
// 五层轨道自内向外：MEANING / SOUND / GRAMMAR / CHUNK / CONTEXT。
// 入场动效 ~1.5s：星体依次点亮 → 轨道轻微旋转后停止（CSS，遵循 prefers-reduced-motion）。
import { useMemo } from "react";
import { View, Text } from "@tarojs/components";
import {
  ORBIT_RING_FRACS,
  ORBIT_RING_LABELS,
  orbitStars,
  palabrasLabel,
  seededRand,
} from "../shared/orbit";
import type { OrbitWord } from "../utils/storage";
import "./star-orbit.scss";

const SIZE = 560; // 轨道区边长（rpx）
const HALF = SIZE / 2;

interface StarOrbitProps {
  words: OrbitWord[];
  /** 中央大数字（外部驱动 0→N 计数动效） */
  count: number;
  /** 词总数（单复数标签；无词兜底时由页面传入今日新词数） */
  total: number;
  activeId?: string | null;
  onStarTap?: (w: OrbitWord) => void;
  /** 兜底/减少动态效果：跳过入场动画 */
  instant?: boolean;
}

export function StarOrbit({
  words,
  count,
  total,
  activeId,
  onStarTap,
  instant,
}: StarOrbitProps) {
  const n = words.length;
  const stars = useMemo(() => orbitStars(n), [n]);

  // 星尘背景（确定性伪随机，36 颗）
  const dust = useMemo(() => {
    const rnd = seededRand(42);
    return Array.from({ length: 36 }, () => ({
      x: rnd() * SIZE,
      y: rnd() * SIZE,
      s: 2 + rnd() * 3,
      o: 0.1 + rnd() * 0.3,
    }));
  }, []);

  return (
    <View className={`so ${instant ? "so--instant" : ""}`}>
      <View className="so__field">
        {/* 星尘 */}
        <View className="so__dust">
          {dust.map((d, i) => (
            <View
              key={i}
              className="so__dust-dot"
              style={{
                left: `${d.x}rpx`,
                top: `${d.y}rpx`,
                width: `${d.s}rpx`,
                height: `${d.s}rpx`,
                opacity: d.o,
              }}
            />
          ))}
        </View>

        {/* 轨道环（轻微旋转后停止） */}
        <View className="so__rings">
          {ORBIT_RING_FRACS.map((f) => (
            <View
              key={f}
              className="so__ring"
              style={{ width: `${f * SIZE}rpx`, height: `${f * SIZE}rpx` }}
            />
          ))}
        </View>

        {/* 维度标签：各环正上方 */}
        {ORBIT_RING_FRACS.map((f, i) => (
          <Text
            key={f}
            className="so__ring-label"
            style={{ top: `${HALF - f * HALF}rpx` }}
          >
            {ORBIT_RING_LABELS[i]}
          </Text>
        ))}

        {/* 词星 */}
        {stars.map((p, i) => {
          const w = words[i];
          if (!w) return null;
          const active = activeId === w.id;
          const x = HALF + Math.cos(p.angleRad) * p.radiusFrac * HALF;
          const y = HALF + Math.sin(p.angleRad) * p.radiusFrac * HALF;
          return (
            <View
              key={w.id}
              className={`so__star ${active ? "so__star--on" : ""}`}
              style={{ left: `${x}rpx`, top: `${y}rpx` }}
              onClick={() => onStarTap?.(w)}
            >
              <View
                className="so__star-in"
                style={{ animationDelay: `${(0.12 + i * 0.08).toFixed(2)}s` }}
              >
                <View className="so__star-dot" />
                <Text className="so__star-label">
                  {active ? w.chinese : w.spanish}
                </Text>
              </View>
            </View>
          );
        })}

        {/* 中央 5D 学习核心 */}
        <View className="so__core">
          <Text className="so__core-num">{count}</Text>
          <Text className="so__core-word">{palabrasLabel(total || n)}</Text>
          <View className="so__core-divider" />
          <Text className="so__core-sub">今日学习完成</Text>
        </View>
      </View>
    </View>
  );
}
