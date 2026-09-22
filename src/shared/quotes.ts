// 每日记忆句 — 星轨打卡页的收藏感来源
// 每天按日期轮换一句简短西语格言（UTC 日切换，与活动记录 dateKey 同步）

export interface DailyQuote {
  es: string;
  zh: string;
}

export const DAILY_QUOTES: DailyQuote[] = [
  { es: "Cada palabra abre un mundo.", zh: "每一个单词，都打开一个世界。" },
  { es: "Poco a poco se aprende.", zh: "一点一点，方能学成。" },
  { es: "Paso a paso, se llega lejos.", zh: "一步一步，行至远方。" },
  { es: "La constancia es la llave.", zh: "坚持，是那把钥匙。" },
  { es: "Hoy sembraste nuevas palabras.", zh: "今天，你又种下了新的词。" },
  { es: "El español se aprende viviendo.", zh: "西语，在生活里学会。" },
  { es: "Cada día cuenta.", zh: "每一天都算数。" },
  { es: "Quien persevera, alcanza.", zh: "坚持者，终有所达。" },
  { es: "Un idioma, mil puertas.", zh: "一门语言，千扇门。" },
  { es: "Mañana será otro buen día.", zh: "明天，又是好日子。" },
  { es: "Aprender es crecer.", zh: "学习，即是生长。" },
  { es: "El tiempo favorece al que estudia.", zh: "时光偏爱学习的人。" },
  { es: "Cada palabra es una semilla.", zh: "每个词，都是一颗种子。" },
  { es: "Sigue así, no pares.", zh: "就这样，别停下。" },
];

/** 该日期的记忆句（dayOfYear 取模轮换；同一天稳定，跨天自动更换） */
export function quoteForDate(d: Date = new Date()): DailyQuote {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const today = Date.UTC(y, d.getUTCMonth(), d.getUTCDate());
  const dayOfYear = Math.floor((today - start) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}
