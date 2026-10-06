// 云端进度同步（Phase 3）— /api/progress 的客户端
//
// 策略（与服务端 LWW 对应）：
//  - 本地有任何未同步变更（pending events 存在 或 lastMutation > lastSynced）
//    → POST 全量状态；accepted 则清空队列并记账
//  - 本地干净 → GET 检查服务端；服务端更新（换设备学习过）且本地无未同步变更 → 采纳
//  - 一切失败静默（离线优先，下次再试）
//
// 触发时机：app 启动/登录后、学习会话完成后、复习会话完成后。

import Taro from "@tarojs/taro";
import type { DayActivity, ReviewState } from "../shared/types";
import { request } from "./request";
import {
  clearPendingEvents,
  getActivity,
  getLastMutation,
  getLastSynced,
  getPendingEvents,
  getPrefs,
  getReviewsCache,
  getToken,
  setActivityAll,
  setLastSynced,
  setPrefs,
  setReviewsCache,
} from "../utils/storage";

interface ProgressPayload {
  updatedAt: number;
  reviews: Record<string, ReviewState>;
  activity: Record<string, DayActivity>;
  prefs?: unknown;
}

export type SyncResult = "ok" | "adopted" | "skipped" | "offline" | "deferred";

/** 游客转登录的合并选择标记（one-shot）：登录时用户选「暂不合并」则置位，
 * 下一次 dirty 同步跳过一次（不 POST 不覆盖云端，本地数据保留）。
 * 用户之后在账号下继续学习，同步恢复正常 —— 兼顾选择权与数据不丢。 */
const KEY_MERGE_DEFERRED = "xz_merge_deferred";

function localState(): ProgressPayload {
  return {
    updatedAt: getLastMutation(),
    reviews: getReviewsCache(),
    activity: getActivity(),
    prefs: getPrefs(),
  };
}

/** 逐词合并：两份 SRS 状态取评分时间（lastRatedAt）较新的一份；单侧独有的直接保留。
 *  防护目标：云端出现过期/被污染的状态（如测试数据覆盖）时，
 *  不再整表覆盖清空本地 —— 本地学过的词永不因同步而丢失。 */
function mergeReviews(
  local: Record<string, ReviewState>,
  server: Record<string, ReviewState>
): Record<string, ReviewState> {
  const out: Record<string, ReviewState> = { ...server };
  for (const [id, r] of Object.entries(local)) {
    const s = out[id];
    if (!s) {
      out[id] = r;
      continue;
    }
    const lt = r.lastRatedAt ? Date.parse(r.lastRatedAt) : 0;
    const st = s.lastRatedAt ? Date.parse(s.lastRatedAt) : 0;
    if (lt > st) out[id] = r;
  }
  return out;
}

/** 逐日合并活动记账：同一天各计数取较大值、错词 id 取并集（幂等，不会丢当日记录） */
function mergeActivity(
  local: Record<string, DayActivity>,
  server: Record<string, DayActivity>
): Record<string, DayActivity> {
  const out: Record<string, DayActivity> = { ...server };
  for (const [k, a] of Object.entries(local)) {
    const s = out[k];
    if (!s) {
      out[k] = a;
      continue;
    }
    const merged: DayActivity = { ...s };
    for (const key of Object.keys(a) as (keyof DayActivity)[]) {
      if (key === "wrongIds") {
        merged.wrongIds = Array.from(
          new Set([...(s.wrongIds ?? []), ...(a.wrongIds ?? [])])
        );
      } else {
        const av = a[key];
        const sv = merged[key];
        if (typeof av === "number" && typeof sv === "number") {
          (merged as unknown as Record<string, unknown>)[key] = Math.max(sv, av);
        }
      }
    }
    out[k] = merged;
  }
  return out;
}

/** 拉取服务端状态；比本地新且本地干净时采纳，返回是否采纳 */
async function pullIfNewer(force = false): Promise<boolean> {
  const server = await request<ProgressPayload>("/api/progress");
  const localMutation = getLastMutation();
  const hasPending = getPendingEvents().length > 0;
  if (!force && (hasPending || server.updatedAt <= localMutation)) {
    return false;
  }
  // 采纳服务端状态（换设备恢复 / 多端同步）—— 逐词逐日合并，不整表覆盖
  if (server.updatedAt > 0) {
    const local = {
      reviews: getReviewsCache(),
      activity: getActivity(),
    };
    setReviewsCache(mergeReviews(local.reviews, server.reviews ?? {}));
    setActivityAll(mergeActivity(local.activity, server.activity ?? {}));
    if (server.prefs && typeof server.prefs === "object") {
      try {
        setPrefs(server.prefs as { startLevel?: string; dailyNew?: number });
      } catch {
        /* prefs 结构异常时忽略，保底默认 */
      }
    }
    setLastSynced(server.updatedAt);
    clearPendingEvents();
    return true;
  }
  return false;
}

/** 主入口：同步本地进度到云端（fire-and-forget 场景直接调用，错误静默） */
export async function syncNow(): Promise<SyncResult> {
  if (!getToken()) return "skipped";
  try {
    const pending = getPendingEvents().length;
    const dirty = pending > 0 || getLastMutation() > getLastSynced();

    if (!dirty) {
      // 本地干净：检查服务端是否有更新的状态（换设备）
      const adopted = await pullIfNewer();
      return adopted ? "adopted" : "ok";
    }

    // 游客转登录时用户选择「暂不合并」→ 本次跳过（one-shot，本地数据保留）
    try {
      if (Taro.getStorageSync(KEY_MERGE_DEFERRED)) {
        Taro.removeStorageSync(KEY_MERGE_DEFERRED);
        return "deferred";
      }
    } catch {
      /* ignore */
    }

    const res = await request<{ ok: boolean; accepted: boolean; serverUpdatedAt: number }>(
      "/api/progress",
      { method: "POST", data: localState() as unknown as Record<string, unknown> }
    );
    if (res.accepted) {
      clearPendingEvents();
      setLastSynced(getLastMutation());
      return "ok";
    }
    // 服务端更新（另一设备学习过）→ 本地待同步事件被 LWW 判负，采纳服务端
    await pullIfNewer(true);
    return "adopted";
  } catch {
    // 网络失败：pending events 保留，下次触发时重试
    return "offline";
  }
}
