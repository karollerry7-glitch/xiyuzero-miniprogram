// 动词变位排版解析 — 把「现在时变位：yo soy, tú eres, …」一行文本
// 解析为结构化块，供 session 5D 语法步骤 / 词库详情分行渲染（每人称一行，左对齐）。
// 解析失败返回 null，调用方回退普通文本渲染（不影响非变位语法条目）。

export interface ConjRow {
  /** 人称代词：yo / tú / él / nosotros … */
  pronoun: string;
  /** 变位形式（反身动词含代词，如 me llamo） */
  form: string;
}

export interface ConjBlock {
  /** 标题：「现在时变位」「e→ie 词干变化」「反身动词」… */
  title: string;
  rows: ConjRow[];
  /** 句号后的补充说明（如「表示身份、国籍、职业、特性」），可能为空 */
  note?: string;
}

/** 西语主语人称代词白名单：不在名单内的一律回退纯文本（防误解析普通语法句） */
const PRONOUNS = new Set([
  "yo",
  "tú",
  "él",
  "ella",
  "usted",
  "nosotros",
  "nosotras",
  "vosotros",
  "vosotras",
  "ellos",
  "ellas",
  "ustedes",
]);

export function parseConjugation(line: string): ConjBlock | null {
  if (!line || !line.includes("：")) return null;
  const ci = line.indexOf("：");
  const title = line.slice(0, ci).trim();
  if (title.length < 2 || title.length > 20) return null;

  let body = line.slice(ci + 1).trim();
  // 尾注：第一个句号之后还有内容 → 作为 note
  let note: string | undefined;
  const dot = body.indexOf("。");
  if (dot >= 0) {
    const rest = body.slice(dot + 1).replace(/[。.]+$/, "").trim();
    if (rest) note = rest;
    body = body.slice(0, dot);
  }
  if (!body) return null;

  // 变位对之间可能用逗号（中英文）、顿号或斜杠分隔
  const parts = body.split(/[,，、/]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const rows: ConjRow[] = [];
  for (const p of parts) {
    const m = p.match(/^(\S+)\s+(.+)$/);
    if (!m || !PRONOUNS.has(m[1])) return null; // 任一段不是「人称 + 变位」→ 整行回退
    rows.push({ pronoun: m[1], form: m[2] });
  }
  return { title, rows, note };
}
