// 词库页 — 等级筛选 + 分页列表 + 收藏星标 + 点击展开 5D 详情
import { useCallback, useEffect, useState } from "react";
import { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView, Input } from "@tarojs/components";
import {
  fetchUnitsByIds,
  fetchUnitsPage,
  searchUnits,
} from "../../services/units";
import { UnitSummary, UnitFull } from "../../shared/types";
import { Loading, ErrorState } from "../../components/states";
import { UnitDetail } from "../../components/unit-detail";
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
  // 5D 展开：单开模式（点另一行自动收起）；详情按 id 缓存
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, UnitFull>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
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

  // 确保详情已加载（懒加载 + 缓存；失败可重试）
  const ensureDetail = async (id: string) => {
    if (details[id]) return;
    setDetailLoading(id);
    try {
      const [full] = await fetchUnitsByIds([id]);
      if (full) setDetails((prev) => ({ ...prev, [id]: full }));
    } catch {
      /* 失败保持占位，用户可点击重试 */
    } finally {
      setDetailLoading(null);
    }
  };

  // 点击行：展开/收起 5D 详情
  const onToggleDetail = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    ensureDetail(id);
  };

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
            <View
              className="lib__item-row"
              onClick={() => onToggleDetail(u.id)}
            >
              <View className="lib__item-main">
                <Text className="lib__es">{u.spanish}</Text>
                <Text className="lib__zh">{u.chinese}</Text>
              </View>
              <Text className="lib__badge">{u.level}</Text>
              <Text
                className={`lib__chevron ${expandedId === u.id ? "lib__chevron--open" : ""}`}
              >
                ˇ
              </Text>
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
            {expandedId === u.id && (
              <View className="lib__detail">
                {detailLoading === u.id && !details[u.id] ? (
                  <Text className="lib__detail-tip">加载 5D 详情…</Text>
                ) : details[u.id] ? (
                  <UnitDetail unit={details[u.id]} />
                ) : (
                  <Text
                    className="lib__detail-tip lib__detail-retry"
                    onClick={() => ensureDetail(u.id)}
                  >
                    详情加载失败，点击重试
                  </Text>
                )}
              </View>
            )}
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
