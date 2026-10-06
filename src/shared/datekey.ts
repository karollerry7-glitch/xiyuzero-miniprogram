// 统一「一天」的划分规则 — 东八区（UTC+8）自然日
// 背景：原先用 new Date().toISOString().slice(0,10)（UTC 日期），对中国用户
// 「一天」会在早上 8 点翻页：凌晨学的词 8 点后会被算成「昨天」，当天记录消失。
// 客户端（storage / stats）与服务端（lib/datekey.ts）必须使用同一规则。
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 东八区日期键 YYYY-MM-DD（默认当前时间） */
export function dayKey(d: Date = new Date()): string {
  return new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}
