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
  /** 轨道区边长（rpx）。默认 560；由页面按可用高度计算，实现单屏自适应 */
  size?: number;
  /** 紧凑模式：隐藏星尘与轨道装饰标签（小屏释放空间，星体与中央数字保留） */
  compact?: boolean;
}

export function StarOrbit({
  words,
  count,
  total,
  activeId,
  onStarTap,
  instant,
  size = 560,
  compact = false,
}: StarOrbitProps) {
  const n = words.length;
  const stars = useMemo(() => orbitStars(n), [n]);
  const HALF = size / 2;

  // 星尘背景（确定性伪随机，36 颗）
  const dust = useMemo(() => {
    const rnd = seededRand(42);
    return Array.from({ length: 36 }, () => ({
      x: rnd() * size,
      y: rnd() * size,
      s: 2 + rnd() * 3,
      o: 0.1 + rnd() * 0.3,
    }));
  }, [size]);

  return (
    <View
      className={`so ${instant ? "so--instant" : ""} ${compact ? "so--compact" : ""}`}
      style={{ width: `${size + 48}rpx`, height: `${size + 48}rpx` }}
    >
      <View
        className="so__field"
        style={{
          left: "24rpx",
          top: "24rpx",
          width: `${size}rpx`,
          height: `${size}rpx`,
        }}
      >
        {/* 星尘（紧凑模式隐藏） */}
        {!compact && (
          <View
            className="so__dust"
            style={{ width: `${size}rpx`, height: `${size}rpx` }}
          >
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
        )}

        {/* 轨道环（轻微旋转后停止） */}
        <View
          className="so__rings"
          style={{ width: `${size}rpx`, height: `${size}rpx` }}
        >
          {ORBIT_RING_FRACS.map((f) => (
            <View
              key={f}
              className="so__ring"
              style={{ width: `${f * size}rpx`, height: `${f * size}rpx` }}
            />
          ))}
        </View>

        {/* 维度标签：各环正上方（紧凑模式隐藏装饰文字） */}
        {!compact &&
          ORBIT_RING_FRACS.map((f, i) => (
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

        {/* 中央 5D 学习核心（完成文案移至星轨下方，由页面渲染） */}
        <View className="so__core">
          <Text className="so__core-num">{count}</Text>
          <Text className="so__core-word">{palabrasLabel(total || n)}</Text>
        </View>
      </View>
    </View>
  );
}
