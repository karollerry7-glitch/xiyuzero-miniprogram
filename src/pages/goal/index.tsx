// 学习目标设置 — 起始等级 + 每日新词数（写 prefs，session 构建队列时实时读取）
// 2026-10-22 收费会员移除：全部等级与每日目标对所有用户开放
import Taro from "@tarojs/taro";
import { useState } from "react";
import { View, Text } from "@tarojs/components";
import { getPrefs, setPrefs } from "../../utils/storage";
import "./index.scss";

const LEVEL_OPTIONS: { level: string; desc: string }[] = [
  { level: "Starter", desc: "零基础入门 · 生存高频词" },
  { level: "A1", desc: "初级 · 日常基础表达" },
  { level: "A2", desc: "初中级 · 生活场景扩展" },
  { level: "B1", desc: "中级 · 独立完整表达" },
  { level: "B2", desc: "中高级 · 流利交流" },
];

const DAILY_OPTIONS = [5, 10, 20, 30, 50];

export default function GoalPage() {
  const initial = getPrefs();
  const [startLevel, setStartLevel] = useState(initial.startLevel);
  const [dailyNew, setDailyNew] = useState(initial.dailyNew);

  const onPickLevel = (level: string) => {
    setStartLevel(level);
  };

  const onPickDaily = (n: number) => {
    setDailyNew(n);
  };

  const onSave = () => {
    setPrefs({ startLevel, dailyNew });
    Taro.showToast({ title: "已保存", icon: "success" });
    setTimeout(() => Taro.navigateBack(), 600);
  };

  return (
    <View className="goal">
      <View className="goal__card">
        <View className="goal__head">
          <Text className="goal__title">起始等级</Text>
          <Text className="goal__sub">新词从该等级开始出题</Text>
        </View>
        {LEVEL_OPTIONS.map((o) => {
          const on = o.level === startLevel;
          return (
            <View
              key={o.level}
              className={`goal__opt ${on ? "goal__opt--on" : ""}`}
              onClick={() => onPickLevel(o.level)}
            >
              <View className="goal__opt-main">
                <Text className="goal__opt-name">{o.level}</Text>
                <Text className="goal__opt-desc">{o.desc}</Text>
              </View>
              <View className={`goal__radio ${on ? "goal__radio--on" : ""}`} />
            </View>
          );
        })}
      </View>

      <View className="goal__card">
        <View className="goal__head">
          <Text className="goal__title">每日新词</Text>
          <Text className="goal__sub">影响每日目标进度</Text>
        </View>
        <View className="goal__daily">
          {DAILY_OPTIONS.map((n) => (
            <View
              key={n}
              className={`goal__num ${n === dailyNew ? "goal__num--on" : ""}`}
              onClick={() => onPickDaily(n)}
            >
              <Text>{n}</Text>
            </View>
          ))}
        </View>
        <Text className="goal__note">
          建议每天 10 分钟左右：先复习到期内容，再学少量新表达，学有余力再调高。
        </Text>
      </View>

      <View className="goal__save" onClick={onSave}>
        <Text>保存</Text>
      </View>
    </View>
  );
}
