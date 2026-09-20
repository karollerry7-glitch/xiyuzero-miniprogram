// TTS 发音服务 — 复用 Web 端 /api/tts（Edge 神经网络人声，CDN 缓存）
// 说明：真机上 InnerAudioContext.src 受合法域名校验（上线前域名备案/云托管同样覆盖此接口）
// 开发期：开发者工具勾选「不校验合法域名」即可

import Taro from "@tarojs/taro";

const BASE_URL =
  process.env.TARO_APP_API_BASE || "https://learn.xiyuzero.com";

let audio: Taro.InnerAudioContext | null = null;

function getCtx(): Taro.InnerAudioContext {
  if (!audio) {
    audio = Taro.createInnerAudioContext();
    audio.obeyMuteSwitch = false;
  }
  return audio;
}

export interface SpeakOptions {
  locale?: "es-MX" | "es-ES";
  rate?: 0.7 | 0.85 | 1;
  gender?: "female" | "male";
}

/** 播放西班牙语发音（切换时自动打断上一次） */
export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!text) return;
  const { locale = "es-MX", rate = 0.85, gender = "female" } = opts;
  try {
    const ctx = getCtx();
    ctx.stop();
    ctx.src =
      `${BASE_URL}/api/tts?q=${encodeURIComponent(text)}` +
      `&locale=${locale}&rate=${rate}&gender=${gender}`;
    ctx.play();
  } catch {
    /* 静音失败不影响学习流程 */
  }
}

export function stopSpeak(): void {
  try {
    audio?.stop();
  } catch {
    /* ignore */
  }
}
