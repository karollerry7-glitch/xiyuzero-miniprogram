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

import { DayActivity, ReviewState, ServerUser } from "../shared/types";

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
  kind: "rate" | "learn" | "recall" | "listen";
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

// ============ 每日活动记录（Phase 2：会话写分 / 首页概览读取） ============
// 与 Web 端 store.ts 的 activity 语义一致（Phase 3 服务端化后由 /api/today 替代）

const KEY_ACTIVITY = "xz_activity";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDay(): DayActivity {
  return {
    newLearned: 0,
    reviewed: 0,
    listening: 0,
    output: 0,
    recallCorrect: 0,
    recallTotal: 0,
    listeningCorrect: 0,
    listeningTotal: 0,
    wrongIds: [],
    meaningCorrect: 0,
    meaningTotal: 0,
    chunkCorrect: 0,
    chunkTotal: 0,
  };
}

export function getActivity(): Record<string, DayActivity> {
  try {
    const raw = Taro.getStorageSync(KEY_ACTIVITY);
    return raw ? (JSON.parse(raw) as Record<string, DayActivity>) : {};
  } catch {
    return {};
  }
}

export function getTodayActivity(): DayActivity {
  return getActivity()[todayKey()] ?? emptyDay();
}

/** 就地更新今日活动（保留旧数据，只追加增量） */
export function bumpTodayActivity(fn: (d: DayActivity) => DayActivity): void {
  try {
    const all = getActivity();
    const k = todayKey();
    all[k] = fn(all[k] ?? emptyDay());
    // 限量：只保留最近 90 天，防存储无限增长
    const keys = Object.keys(all).sort().slice(-90);
    const trimmed: Record<string, DayActivity> = {};
    for (const key of keys) trimmed[key] = all[key];
    Taro.setStorageSync(KEY_ACTIVITY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

/** 连续学习天数（与 Web selectors.streakDays 一致：今天没学不算断签） */
export function streakDaysLocal(): number {
  const activity = getActivity();
  let streak = 0;
  const d = new Date();
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    const a = activity[k];
    const did =
      a && (a.newLearned > 0 || a.reviewed > 0 || a.listening > 0 || a.output > 0);
    if (did) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (k === todayKey()) {
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// ============ 学习偏好（Phase 2 骨架版：起始等级 + 每日新词数） ============

const KEY_PREFS = "xz_prefs";

export interface Prefs {
  startLevel: string; // Starter | A1 | A2 | B1 | B2
  dailyNew: number;
}

const DEFAULT_PREFS: Prefs = { startLevel: "Starter", dailyNew: 20 };

export function getPrefs(): Prefs {
  try {
    const raw = Taro.getStorageSync(KEY_PREFS);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Prefs) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setPrefs(patch: Partial<Prefs>): void {
  try {
    Taro.setStorageSync(KEY_PREFS, JSON.stringify({ ...getPrefs(), ...patch }));
  } catch {
    /* ignore */
  }
}

// ============ 收藏（我的页 Phase 9） ============
// 第一版本地存储（不上云）：收藏是轻量书签语义，
// 云端 progress blob 由 Web 端共用，贸然并入 prefs 有跨端覆盖风险；
// 后续需要多端收藏时再开独立云端 key。

const KEY_FAVORITES = "xz_favorites";

/** 收藏的词条 id 列表（按收藏时间升序） */
export function getFavorites(): string[] {
  try {
    const raw = Taro.getStorageSync(KEY_FAVORITES);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function isFavorite(unitId: string): boolean {
  return getFavorites().includes(unitId);
}

/** 切换收藏状态，返回切换后是否已收藏 */
export function toggleFavorite(unitId: string): boolean {
  const list = getFavorites();
  const i = list.indexOf(unitId);
  if (i >= 0) {
    list.splice(i, 1);
    Taro.setStorageSync(KEY_FAVORITES, JSON.stringify(list));
    return false;
  }
  list.push(unitId);
  // 限量：只保留最近 500 个收藏，防存储无限增长
  const trimmed = list.slice(-500);
  Taro.setStorageSync(KEY_FAVORITES, JSON.stringify(trimmed));
  return true;
}

// ============ 云端同步（Phase 3：LWW 状态同步的本地记账） ============

const KEY_LAST_MUTATION = "xz_last_mutation"; // 本地最后一次学习状态变更（ms 时间戳）
const KEY_LAST_SYNCED = "xz_last_synced"; // 已成功上传到云端的状态版本（ms 时间戳）

/** 本地最后一次变更时间（0 = 从未变更，如全新设备） */
export function getLastMutation(): number {
  try {
    return Number(Taro.getStorageSync(KEY_LAST_MUTATION)) || 0;
  } catch {
    return 0;
  }
}

/** 任何学习状态写入时调用（progress.ts 的动作层负责） */
export function bumpMutation(): void {
  try {
    Taro.setStorageSync(KEY_LAST_MUTATION, Date.now());
  } catch {
    /* ignore */
  }
}

export function getLastSynced(): number {
  try {
    return Number(Taro.getStorageSync(KEY_LAST_SYNCED)) || 0;
  } catch {
    return 0;
  }
}

export function setLastSynced(version: number): void {
  try {
    Taro.setStorageSync(KEY_LAST_SYNCED, version);
  } catch {
    /* ignore */
  }
}

/** 整体写入活动记录（云端同步采纳时用；同样限量 90 天） */
export function setActivityAll(all: Record<string, DayActivity>): void {
  try {
    const keys = Object.keys(all).sort().slice(-90);
    const trimmed: Record<string, DayActivity> = {};
    for (const key of keys) trimmed[key] = all[key];
    Taro.setStorageSync(KEY_ACTIVITY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

// ============ 会员视图缓存（Phase 4：Entitlement 层的本地兜底） ============

const KEY_MEMBERSHIP = "xz_membership";

/** services/membership.ts 的缓存子集（isPro 由读取方实时重算） */
export interface MembershipCache {
  plan: "free" | "pro";
  billingCycle: "monthly" | "yearly" | "lifetime" | null;
  proUntil: string | null;
  usage: { date: string; newLearnedToday: number } | null;
  fetchedAt: number;
}

export function getMembershipCache(): MembershipCache | null {
  try {
    const raw = Taro.getStorageSync(KEY_MEMBERSHIP);
    return raw ? (JSON.parse(raw) as MembershipCache) : null;
  } catch {
    return null;
  }
}

export function setMembershipCache(c: MembershipCache): void {
  try {
    Taro.setStorageSync(KEY_MEMBERSHIP, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}
