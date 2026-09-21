// 我的收藏 — 词库页点星标的词条（本地存储，第一版不上云）
// 点击星标取消收藏；点击喇叭听发音
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { View, Text } from "@tarojs/components";
import { getFavorites, toggleFavorite } from "../../utils/storage";
import { fetchUnitsByIds } from "../../services/units";
import { speak } from "../../services/tts";
import { Loading, EmptyState, ErrorState } from "../../components/states";
import "./index.scss";

const BATCH = 20;

export default function FavoritesPage() {
  const [rows, setRows] = useState<
    { id: string; spanish: string; chinese: string; level: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const ids = getFavorites();
      const out: typeof rows = [];
      // 收藏按时间倒序展示（新收藏在前）
      for (let i = ids.length - 1; i >= 0 && out.length < 100; i -= BATCH) {
        const batch = ids.slice(Math.max(0, i - BATCH + 1), i + 1);
        const units = await fetchUnitsByIds(batch);
        for (let j = units.length - 1; j >= 0; j--) {
          out.push(units[j]);
        }
      }
      setRows(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });

  const onRemove = (id: string) => {
    toggleFavorite(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    Taro.showToast({ title: "已取消收藏", icon: "none" });
  };

  return (
    <View className="fav">
      {error && <ErrorState desc={error} onRetry={load} />}
      {!error && !loading && rows.length === 0 && (
        <EmptyState
          icon="⭐"
          title="还没有收藏"
          desc="在词库里点击 ☆ 收藏喜欢的词条"
        />
      )}

      <View className="fav__list">
        {rows.map((r) => (
          <View key={r.id} className="fav__row">
            <View className="fav__main">
              <View className="fav__es-wrap">
                <Text className="fav__es">{r.spanish}</Text>
                <Text className="fav__badge">{r.level}</Text>
              </View>
              <Text className="fav__zh">{r.chinese}</Text>
            </View>
            <View className="fav__actions">
              <View
                className="fav__speak"
                onClick={() => speak(r.spanish)}
                hoverClass="fav__speak--press"
              >
                <Text className="fav__speak-icon">🔊</Text>
              </View>
              <View
                className="fav__star"
                onClick={() => onRemove(r.id)}
                hoverClass="fav__star--press"
              >
                <Text className="fav__star-icon">★</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {loading && <Loading />}
    </View>
  );
}

