// 错词本 — wrongCount > 0 的词条（本地 reviews 缓存 + API 详情）
// 最近答错的排前面；点击喇叭听发音，通过复习自然移出（对 3 次答对）
import { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { View, Text } from "@tarojs/components";
import { wrongWords } from "../../shared/stats";
import { getReviewsCache } from "../../utils/storage";
import { fetchUnitsByIds } from "../../services/units";
import { speak, preload } from "../../services/tts";
import { Loading, EmptyState, ErrorState } from "../../components/states";
import "./index.scss";

// 单页上限：错词本只展示最近 100 条（fetchUnitsByIds 每批 ≤ 20 的接口约束，分批拉）
const MAX_SHOW = 100;
const BATCH = 20;

export default function WrongbookPage() {
  const [rows, setRows] = useState<
    { id: string; spanish: string; chinese: string; level: string; wrongCount: number }[]
  >([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const entries = wrongWords(getReviewsCache()).slice(0, MAX_SHOW);
      setTotal(entries.length);
      const out: typeof rows = [];
      for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH);
        const units = await fetchUnitsByIds(batch.map((b) => b.unitId));
        const byId = new Map(units.map((u) => [u.id, u]));
        for (const b of batch) {
          const u = byId.get(b.unitId);
          if (u) {
            out.push({
              id: u.id,
              spanish: u.spanish,
              chinese: u.chinese,
              level: u.level,
              wrongCount: b.wrongCount,
            });
          }
        }
      }
      setRows(out);
      // 预缓冲最前面几行的发音（点击 🔊 秒播；池容量 4）
      out.slice(0, 4).forEach((r) => preload(r.spanish));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });

  return (
    <View className="wb">
      <View className="wb__tip">
        <Text className="wb__tip-text">
          共 {total} 个错词 · 通过复习答对 3 次后自动移出
        </Text>
      </View>

      {error && <ErrorState desc={error} onRetry={load} />}
      {!error && !loading && rows.length === 0 && (
        <EmptyState
          icon="🎉"
          title="暂无错词"
          desc="保持这个状态，继续加油！"
        />
      )}

      <View className="wb__list">
        {rows.map((r) => (
          <View key={r.id} className="wb__row">
            <View className="wb__main">
              <View className="wb__es-wrap">
                <Text className="wb__es">{r.spanish}</Text>
                <Text className="wb__badge">{r.level}</Text>
                <Text className="wb__wrong-n">✕ {r.wrongCount}</Text>
              </View>
              <Text className="wb__zh">{r.chinese}</Text>
            </View>
            <View
              className="wb__speak"
              onClick={() => speak(r.spanish)}
              hoverClass="wb__speak--press"
            >
              <Text className="wb__speak-icon">🔊</Text>
            </View>
          </View>
        ))}
      </View>

      {loading && <Loading />}
    </View>
  );
}
