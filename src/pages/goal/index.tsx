// 学习目标设置 — 起始等级 + 每日新词数（写 prefs，session 构建队列时实时读取）
// 等级权限遵循会员层：Free 只能选 Starter / A1（config/membership.ts FREE_LEVELS）
import Taro from "@tarojs/taro";
import { useState } from "react";
import { View, Text } from "@tarojs/components";
import { getCachedMembership, levelAllowed } from "../../services/membership";
import { getPrefs, setPrefs } from "../../utils/storage";
import { FREE_DAILY_NEW_WORD_LIMIT } from "../../config/membership";
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
  const m = getCachedMembership();
  const [startLevel, setStartLevel] = useState(initial.startLevel);
  const [dailyNew, setDailyNew] = useState(initial.dailyNew);

  const onPickLevel = (level: string) => {
    if (!levelAllowed(m, level)) {
      Taro.showModal({
        title: "需要 Pro",
        content: `${level} 词库为 Pro 专属，Free 用户可从 Starter / A1 开始学习。`,
        confirmText: "去开通",
        success: (res) => {
          if (res.confirm) {
            Taro.navigateTo({ url: "/pages/membership/index" });
          }
        },
      });
      return;
    }
    setStartLevel(level);
  };

  const onPickDaily = (n: number) => {
    setDailyNew(n);
    if (!m.isPro && n > FREE_DAILY_NEW_WORD_LIMIT) {
      Taro.showToast({
        title: `Free 每日上限 ${FREE_DAILY_NEW_WORD_LIMIT} 词`,
        icon: "none",
        duration: 2000,
      });
    }
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
          const locked = !levelAllowed(m, o.level);
          const on = o.level === startLevel;
          return (
            <View
              key={o.level}
              className={`goal__opt ${on ? "goal__opt--on" : ""}`}
              onClick={() => onPickLevel(o.level)}
            >
              <View className="goal__opt-main">
                <Text className="goal__opt-name">
                  {o.level}
                  {locked && <Text className="goal__lock">PRO</Text>}
                </Text>
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
        {!m.isPro && (
          <Text className="goal__note">
            Free 用户每日最多学习 {FREE_DAILY_NEW_WORD_LIMIT} 个新词，设置更高时按{" "}
            {FREE_DAILY_NEW_WORD_LIMIT} 生效；复习与浏览不受限。
          </Text>
        )}
      </View>

      <View className="goal__save" onClick={onSave}>
        <Text>保存</Text>
      </View>
    </View>
  );
}
