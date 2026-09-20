// 本地存储封装 — 唯一的 wx.storage 访问入口
// 服务端是 Source of Truth；这里只存：token、用户、会话缓存、离线队列

import Taro from "@tarojs/taro";

const KEY_TOKEN = "xz_token";
const KEY_TOKEN_EXP = "xz_token_exp";
const KEY_USER = "xz_user";
const KEY_REVIEWS_CACHE = "xz_reviews_cache";
const KEY_PENDING_EVENTS = "xz_pending_events";

// wx.setStorageSync 单 key 上限 1MB，评分事件队列单独管理并限量
const MAX_PENDING_EVENTS = 200;

import { ReviewState, ServerUser } from "../shared/types";

export function getToken(): string | null {
  try {
    return Taro.getStorageSync(KEY_TOKEN) || null;
  } catch {
    return null;
  }
}

export function getTokenExp(): number {
  try {
    return Number(Taro.getStorageSync(KEY_TOKEN_EXP)) || 0;
  } catch {
    return 0;
  }
}

export function setToken(token: string, expiresIn: number): void {
  try {
    Taro.setStorageSync(KEY_TOKEN, token);
    Taro.setStorageSync(KEY_TOKEN_EXP, Date.now() + expiresIn * 1000);
  } catch {
    /* 存储失败静默 */
  }
}

export function clearToken(): void {
  try {
    Taro.removeStorageSync(KEY_TOKEN);
    Taro.removeStorageSync(KEY_TOKEN_EXP);
    Taro.removeStorageSync(KEY_USER);
  } catch {
    /* ignore */
  }
}

export function getUser(): ServerUser | null {
  try {
    const raw = Taro.getStorageSync(KEY_USER);
    return raw ? (JSON.parse(raw) as ServerUser) : null;
  } catch {
    return null;
  }
}

export function setUser(user: ServerUser): void {
  try {
    Taro.setStorageSync(KEY_USER, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

/** 学习状态缓存（加速首页/词库渲染；服务端为准） */
export function getReviewsCache(): Record<string, ReviewState> {
  try {
    const raw = Taro.getStorageSync(KEY_REVIEWS_CACHE);
    return raw ? (JSON.parse(raw) as Record<string, ReviewState>) : {};
  } catch {
    return {};
  }
}

export function setReviewsCache(reviews: Record<string, ReviewState>): void {
  try {
    Taro.setStorageSync(KEY_REVIEWS_CACHE, JSON.stringify(reviews));
  } catch {
    // 超过 1MB 上限时放弃写入（下一次全量拉取）
  }
}

/** 离线评分事件队列（断网时暂存，恢复后同步） */
export interface PendingEvent {
  kind: "rate" | "learn" | "recall";
  unitId: string;
  payload: unknown;
  ts: number;
}

export function getPendingEvents(): PendingEvent[] {
  try {
    const raw = Taro.getStorageSync(KEY_PENDING_EVENTS);
    return raw ? (JSON.parse(raw) as PendingEvent[]) : [];
  } catch {
    return [];
  }
}

export function pushPendingEvent(ev: PendingEvent): void {
  const list = getPendingEvents();
  list.push(ev);
  // 限量：最坏情况防溢出（丢最旧）
  const trimmed = list.slice(-MAX_PENDING_EVENTS);
  try {
    Taro.setStorageSync(KEY_PENDING_EVENTS, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export function clearPendingEvents(): void {
  try {
    Taro.removeStorageSync(KEY_PENDING_EVENTS);
  } catch {
    /* ignore */
  }
}
