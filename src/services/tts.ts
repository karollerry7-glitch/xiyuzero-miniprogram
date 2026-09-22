// TTS 发音服务 — 复用 Web 端 /api/tts（Edge 神经网络人声，CDN 缓存）
//
// 性能设计（预加载）：
//   首次合成需要 1~3 秒（Vercel → Edge TTS 实时合成），点击后再等必然卡顿。
//   因此维护一个小型 InnerAudioContext 池：preload() 在 UI 渲染时就设置 src
//   （小程序会立刻开始缓冲音频），speak() 点击时命中已缓冲的实例立即播放。
//   池上限 4 个（微信建议 InnerAudioContext 并发 ≤5），满时淘汰最久未用的。
//
// 真机注意：InnerAudioContext.src 受合法域名校验（域名备案前的体验版需开启
// 「开发调试」）。加载失败时给出一次可见提示（节流），便于用户自诊断。

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

interface Slot {
  ctx: Taro.InnerAudioContext;
  url: string;
  used: number; // 最近使用时间（LRU 淘汰）
  played: boolean; // 是否播放过（重播需要先 stop 回到开头）
  errorNotified: boolean; // 该槽位是否已提示过错误
}

const MAX_SLOTS = 4;
const slots: Slot[] = [];

/** 错误提示节流：10 秒内最多弹一次 */
let lastErrToastAt = 0;
function notifyError(errCode: number): void {
  const now = Date.now();
  if (now - lastErrToastAt < 10_000) return;
  lastErrToastAt = now;
  // 10003/10002 = 域名不在合法列表（未开调试模式/未备案）；-1 = 网络失败
  const msg =
    errCode === 10003 || errCode === 10002
      ? "语音加载被拦截：请在右上角开启「开发调试」后重试"
      : "语音加载失败，请检查网络后重试";
  Taro.showToast({ title: msg, icon: "none", duration: 2500 });
}

/** 拿到 url 对应的槽位（命中复用；未命中则新建/淘汰最旧槽并设 src 开始缓冲） */
function slotFor(url: string): Slot {
  let s = slots.find((x) => x.url === url);
  if (!s) {
    if (slots.length < MAX_SLOTS) {
      const ctx = Taro.createInnerAudioContext();
      ctx.obeyMuteSwitch = false;
      const slot: Slot = {
        ctx,
        url,
        used: Date.now(),
        played: false,
        errorNotified: false,
      };
      // 错误监听：创建时挂一次（onXxx 可叠加，不能重复挂），
      // 闭包引用 slot 对象，淘汰换 src 后标记位自动生效
      ctx.onError((e) => {
        console.warn("[tts] audio error", slot.url.slice(-60), e);
        if (!slot.errorNotified) {
          slot.errorNotified = true;
          notifyError(e && (e.errCode ?? -1));
        }
      });
      s = slot;
      slots.push(slot);
    } else {
      s = slots.reduce((a, b) => (a.used < b.used ? a : b));
      s.ctx.stop();
      s.ctx.src = url;
      s.url = url;
      s.used = Date.now();
      s.played = false;
      s.errorNotified = false;
    }
  }
  return s;
}

/** 预加载：在 UI 渲染时调用，提前缓冲音频（点击 🔊 时秒播） */
export function preload(text: string, opts: SpeakOptions = {}): void {
  if (!text) return;
  try {
    slotFor(ttsUrl(text, opts));
  } catch {
    /* 静音失败不影响学习流程 */
  }
}

/** 播放西班牙语发音（自动打断上一次；同词重听从头开始） */
export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!text) return;
  try {
    const me = slotFor(ttsUrl(text, opts));
    me.used = Date.now();
    // 打断其他正在播放的（同一时间只有一个声音）
    for (const s of slots) {
      if (s !== me) {
        try {
          s.ctx.stop();
        } catch {
          /* ignore */
        }
      }
    }
    if (me.played) {
      // 已播过/正在播 → 回到开头。iOS 上 stop() 是异步的，
      // 立即 play() 可能被吞 → 延迟 50ms 再播（微信社区通用兼容方案）
      me.ctx.stop();
      setTimeout(() => {
        try {
          me.ctx.play();
        } catch {
          /* ignore */
        }
      }, 50);
    } else {
      me.ctx.play();
    }
    me.played = true;
  } catch {
    /* 静音失败不影响学习流程 */
  }
}

export function stopSpeak(): void {
  try {
    for (const s of slots) s.ctx.stop();
  } catch {
    /* ignore */
  }
}
