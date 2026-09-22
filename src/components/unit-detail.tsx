// 5D 单词详情 — 词库/收藏等列表的展开内容（与学习会话同源数据 UnitFull.fiveD）
import { useEffect } from "react";
import { View, Text } from "@tarojs/components";
import type { UnitFull } from "../shared/types";
import { speak, preload } from "../services/tts";
import "./unit-detail.scss";

export function UnitDetail({ unit }: { unit: UnitFull }) {
  const fiveD = unit.fiveD;

  // 渲染即预缓冲：主词 + 首个词块/例句（点击 🔊 时已就绪，秒播）
  useEffect(() => {
    preload(unit.spanish);
    if (fiveD) {
      if (fiveD.chunks[0]) preload(fiveD.chunks[0].spanish);
      if (fiveD.sentences[0]) preload(fiveD.sentences[0].spanish);
    } else {
      preload(unit.example.spanish);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit.id]);


  if (!fiveD) {
    // 无 5D 数据的兜底（与 session 页 fallback 一致）
    return (
      <View className="ud">
        <View className="ud__row">
          <Text className="ud__label">词性</Text>
          <Text className="ud__val">{unit.partOfSpeech}</Text>
        </View>
        <View className="ud__row">
          <Text className="ud__label">词频</Text>
          <Text className="ud__val">{unit.frequency}</Text>
        </View>
        <View className="ud__row ud__row--col">
          <View className="ud__row-head">
            <Text className="ud__label">例句</Text>
            <View className="ud__audio" onClick={() => speak(unit.example.spanish)}>
              <Text>🔊</Text>
            </View>
          </View>
          <Text className="ud__es">{unit.example.spanish}</Text>
          <Text className="ud__zh">{unit.example.chinese}</Text>
        </View>
        {unit.grammarNote && (
          <View className="ud__row ud__row--col">
            <Text className="ud__label">语法要点</Text>
            <Text className="ud__val">{unit.grammarNote}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="ud">
      {/* D2 发音 */}
      <View className="ud__sec">
        <Text className="ud__sec-title">发音</Text>
        <View className="ud__sound">
          <View className="ud__sound-info">
            <Text className="ud__syl">{fiveD.sound.syllables}</Text>
            <Text className="ud__stress">{fiveD.sound.stress}</Text>
          </View>
          <View className="ud__audio" onClick={() => speak(unit.spanish)}>
            <Text>🔊</Text>
          </View>
        </View>
      </View>

      {/* D1 含义 */}
      <View className="ud__sec">
        <Text className="ud__sec-title">含义</Text>
        <Text className="ud__meaning">{fiveD.meaning}</Text>
      </View>

      {/* D3 语法 */}
      {fiveD.grammar.length > 0 && (
        <View className="ud__sec">
          <Text className="ud__sec-title">语法</Text>
          {fiveD.grammar.map((g, i) => (
            <View className="ud__grammar-item" key={i}>
              <Text className="ud__num">{i + 1}</Text>
              <Text className="ud__val">{g}</Text>
            </View>
          ))}
        </View>
      )}

      {/* D4 词块 */}
      {fiveD.chunks.length > 0 && (
        <View className="ud__sec">
          <Text className="ud__sec-title">词块</Text>
          {fiveD.chunks.map((c, i) => (
            <View className="ud__pair" key={i}>
              <View className="ud__pair-main">
                <Text className="ud__es">{c.spanish}</Text>
                <Text className="ud__zh">{c.chinese}</Text>
              </View>
              <View className="ud__audio" onClick={() => speak(c.spanish)}>
                <Text>🔊</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* D5 例句 */}
      {fiveD.sentences.length > 0 && (
        <View className="ud__sec">
          <Text className="ud__sec-title">例句</Text>
          {fiveD.sentences.map((s, i) => (
            <View className="ud__pair" key={i}>
              <View className="ud__pair-main">
                <View className="ud__sent-es">
                  <Text className="ud__es">{s.spanish}</Text>
                  <View className="ud__audio ud__audio--sm" onClick={() => speak(s.spanish)}>
                    <Text>🔊</Text>
                  </View>
                </View>
                <Text className="ud__zh">{s.chinese}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
