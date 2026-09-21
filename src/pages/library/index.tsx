// 词库页 — 等级筛选 + 分页列表 + 收藏星标（API 联通验证页：Phase 1 打通 /api/units）
import { useCallback, useEffect, useState } from "react";
import { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView, Input } from "@tarojs/components";
import {
  fetchUnitsPage,
  searchUnits,
} from "../../services/units";
import { UnitSummary } from "../../shared/types";
import { Loading, ErrorState } from "../../components/states";
import { isFavorite, toggleFavorite } from "../../utils/storage";
import "./index.scss";

const LEVELS = ["全部", "Starter", "A1", "A2", "B1", "B2"];
const PAGE_SIZE = 50;

export default function LibraryPage() {
  const [level, setLevel] = useState<string>("全部");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<UnitSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favs, setFavs] = useState<Record<string, boolean>>({});

  const refreshFavs = useCallback(() => {
    const map: Record<string, boolean> = {};
    for (const it of items) map[it.id] = isFavorite(it.id);
    setFavs(map);
  }, [items]);

  useEffect(() => {
    refreshFavs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // 从收藏页返回时同步星标状态（收藏页可取消收藏）
  useDidShow(() => {
    const map: Record<string, boolean> = {};
    for (const it of items) map[it.id] = isFavorite(it.id);
    setFavs(map);
  });

  const load = useCallback(
    async (p: number, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res =
          q.trim().length > 0
            ? await searchUnits(q.trim(), level === "全部" ? undefined : level, p, PAGE_SIZE)
            : await fetchUnitsPage(
                level === "全部" ? undefined : level,
                p,
                PAGE_SIZE
              );
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    },
    [level, q]
  );

  useEffect(() => {
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const hasMore = items.length < total;

  return (
    <View className="lib">
      {/* 搜索框 */}
      <View className="lib__search">
        <Input
          className="lib__input"
          placeholder="搜索西班牙语 / 中文"
          value={q}
          confirmType="search"
          onInput={(e) => setQ(e.detail.value)}
          onConfirm={() => load(1, true)}
        />
      </View>

      {/* 等级筛选 */}
      <ScrollView className="lib__levels" scrollX enhanced showScrollbar={false}>
        {LEVELS.map((lv) => (
          <Text
            key={lv}
            className={`lib__chip ${lv === level ? "lib__chip--on" : ""}`}
            onClick={() => setLevel(lv)}
          >
            {lv}
          </Text>
        ))}
      </ScrollView>

      {/* 列表 */}
      {error && (
        <ErrorState desc={error} onRetry={() => load(1, true)} />
      )}
      {!error && items.length === 0 && !loading && (
        <View className="lib__empty">
          <Text className="lib__empty-text">没有找到匹配的词条</Text>
        </View>
      )}
      <View className="lib__list">
        {items.map((u) => (
          <View key={u.id} className="lib__item">
            <View className="lib__item-main">
              <Text className="lib__es">{u.spanish}</Text>
              <Text className="lib__zh">{u.chinese}</Text>
            </View>
            <Text className="lib__badge">{u.level}</Text>
            <Text
              className={`lib__star ${favs[u.id] ? "lib__star--on" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                const on = toggleFavorite(u.id);
                setFavs((prev) => ({ ...prev, [u.id]: on }));
              }}
            >
              {favs[u.id] ? "★" : "☆"}
            </Text>
          </View>
        ))}
      </View>
      {loading && <Loading />}
      {hasMore && !loading && (
        <View className="lib__more" onClick={() => load(page + 1, false)}>
          <Text>加载更多（{items.length}/{total}）</Text>
        </View>
      )}
    </View>
  );
}
