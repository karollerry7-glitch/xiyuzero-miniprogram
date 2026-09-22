// TTS 发音服务 — 复用 Web 端 /api/tts（Edge 神经网络人声，CDN 缓存）
//
// 架构（v2，downloadFile 方案）：
//   早期版本让 InnerAudioContext.src 直接加载网络 URL——在部分 iOS 真机上
//   网络栈不稳定（request 正常但音频 src 加载失败 errCode=-1/10006，且无明确原因）。
//   现改为：Taro.downloadFile 把 mp3 下到本地临时文件 → InnerAudioContext 播放本地路径。
//   优点：① 下载走 wx 网络栈，与 API 请求同源（API 通则下载通），失败有明确
//   statusCode/errMsg；② 本地文件播放无网络怪癖；③ 下载结果缓存（LRU），
//   CDN 命中后二次点击零等待。
//
// 预加载：preload() 在 UI 渲染时就开始下载，点击时命中缓存立即播放。

import Taro from "@tarojs/taro";

const BASE_URL =
  process.env.TARO_APP_API_BASE || "https://learn.xiyuzero.com";

export interface SpeakOptions {
  locale?: "es-MX" | "es-ES";
  rate?: 0.7 | 0.85 | 1;
  gender?: "female" | "male";
}

function ttsUrl(text: string, opts: SpeakOptions): string {
  const { locale = "es-MX", rate = 0.85, gender = "female" } = opts;
  return (
    `${BASE_URL}/api/tts?q=${encodeURIComponent(text)}` +
    `&locale=${locale}&rate=${rate}&gender=${gender}`
  );
}

// ============ 本地文件缓存（LRU，上限 12 个临时文件） ============

interface CachedAudio {
  path: string;
  used: number;
}

const MAX_CACHE = 12;
const cache = new Map<string, CachedAudio>(); // url → 本地临时路径
const inflight = new Map<string, Promise<string>>(); // 并发去重

// 全局音频选项：iOS 静音键下仍可外放
try {
  Taro.setInnerAudioOption({ obeyMuteSwitch: false });
} catch {
  /* 低版本基础库忽略 */
}

/** 错误提示节流：10 秒内最多弹一次 */
let lastErrToastAt = 0;
function notifyError(detail: string): void {
  const now = Date.now();
  if (now - lastErrToastAt < 10_000) return;
  lastErrToastAt = now;

  // downloadFile 域名白名单拦截（真机体验版最常见）：
  // errMsg 形如 "downloadFile:fail url not in domain list"
  const lower = detail.toLowerCase();
  if (lower.includes("not in domain list") || lower.includes("domain")) {
    Taro.showToast({
      title: "开发者需在小程序后台配置 downloadFile 合法域名",
      icon: "none",
      duration: 3000,
    });
    return;
  }

  Taro.showToast({
    title: `语音加载失败（${detail}）`,
    icon: "none",
    duration: 2500,
  });
}

/** 下载 tts 音频到本地临时文件（带缓存与并发去重） */
function download(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) {
    hit.used = Date.now();
    return Promise.resolve(hit.path);
  }
  const running = inflight.get(url);
  if (running) return running;

  const p = new Promise<string>((resolve, reject) => {
    Taro.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        // LRU 淘汰
        if (cache.size >= MAX_CACHE) {
          let oldestKey = "";
          let oldestUsed = Infinity;
          cache.forEach((v, k) => {
            if (v.used < oldestUsed) {
              oldestUsed = v.used;
              oldestKey = k;
            }
          });
          if (oldestKey) cache.delete(oldestKey);
        }
        cache.set(url, { path: res.tempFilePath, used: Date.now() });
        resolve(res.tempFilePath);
      },
      fail: (e) => {
        reject(new Error(e.errMsg || "download fail"));
      },
    });
  });
  inflight.set(url, p);
  p.finally(() => inflight.delete(url));
  return p;
}

// ============ 播放器池（4 个本地播放实例，LRU 复用） ============

interface Slot {
  ctx: Taro.InnerAudioContext;
  used: number;
  /** 新设 src 后等待 onCanplay 再补一次 play（iOS 首播吞 play 的兜底） */
  pendingPlay: boolean;
}

const MAX_SLOTS = 4;
const slots: Slot[] = [];

function slotFor(): Slot {
  if (slots.length < MAX_SLOTS) {
    const ctx = Taro.createInnerAudioContext();
    ctx.obeyMuteSwitch = false;
    ctx.volume = 1;
    // 播放失败必须浮出（此前静默失败导致无提示）
    ctx.onError((e) => {
      const detail = e.errMsg || `errCode ${e.errCode ?? "?"}`;
      notifyError(`本地播放失败：${detail}`.slice(0, 40));
    });
    const slot: Slot = { ctx, used: 0, pendingPlay: false };
    ctx.onCanplay(() => {
      if (slot.pendingPlay) {
        slot.pendingPlay = false;
        try {
          slot.ctx.play();
        } catch {
          /* ignore */
        }
      }
    });
    slots.push(slot);
    return slot;
  }
  return slots.reduce((a, b) => (a.used < b.used ? a : b));
}

/**
 * 播放本地文件。
 * - 新 src：设 src 后立即 play（开发者工具/安卓直接响）；iOS 首播 play 可能
 *   被吞 → onCanplay 里再补一次（pendingPlay 标记，双保险不重复起播）。
 * - 同文件重听：stop 后延迟 50ms 再 play（iOS 异步 stop 吞 play 的兼容）。
 */
function playLocal(slot: Slot, path: string): void {
  slot.used = Date.now();
  for (const s of slots) {
    if (s !== slot) {
      try {
        s.ctx.stop();
      } catch {
        /* ignore */
      }
    }
  }
  if (slot.ctx.src !== path) {
    slot.pendingPlay = true;
    slot.ctx.stop();
    slot.ctx.src = path;
    try {
      slot.ctx.play();
    } catch {
      /* ignore */
    }
  } else {
    slot.pendingPlay = false;
    slot.ctx.stop();
    setTimeout(() => {
      try {
        slot.ctx.play();
      } catch {
        /* ignore */
      }
    }, 50);
  }
}

// ============ 对外接口（与页面调用方式完全兼容） ============

/** 预加载：在 UI 渲染时调用，提前下载音频（点击 🔊 时秒播） */
export function preload(text: string, opts: SpeakOptions = {}): void {
  if (!text) return;
  download(ttsUrl(text, opts)).catch(() => {
    /* 预载失败静默：点击时 download 会重试并给出提示 */
  });
}

/** 播放西班牙语发音（自动打断上一次；同词重听从头开始） */
export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!text) return;
  download(ttsUrl(text, opts))
    .then((path) => {
      playLocal(slotFor(), path);
    })
    .catch((e) => {
      console.warn("[tts] download error", e && e.message);
      notifyError(e instanceof Error ? e.message.slice(0, 24) : "网络异常");
    });
}

export function stopSpeak(): void {
  try {
    for (const s of slots) s.ctx.stop();
  } catch {
    /* ignore */
  }
}
