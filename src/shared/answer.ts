// ============================================================
// 复用自 Web 端 xiyuzero-learn/lib/answer.ts（2026-09-18 快照）
// 零改动（本文件无外部依赖）
// ============================================================

// Chinese → Spanish 答案判断
// 规则：忽略大小写、重音/变音符号（á→a、é→e、ñ→n、ü→u 等，
// 方便无西班牙语键盘的用户）与部分标点；拼写错误不算完全正确；
// 相似度 >= 0.85 判为「接近正确」，否则错误。

export type AnswerResult = "correct" | "close" | "wrong";

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¡!¿?.,;:"'()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[n];
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// accepted: 额外可接受答案（如去冠词形式）
export function checkAnswer(
  input: string,
  expected: string,
  accepted: string[] = []
): AnswerResult {
  const norm = normalize(input);
  if (!norm) return "wrong";
  const targets = [expected, ...accepted].map(normalize);
  for (const t of targets) {
    if (norm === t) return "correct";
  }
  let best = 0;
  for (const t of targets) {
    best = Math.max(best, similarity(norm, t));
  }
  return best >= 0.85 ? "close" : "wrong";
}

// 名词带冠词学习时，允许用户省略冠词 → 判 close
export function acceptedForms(spanish: string, article?: string): string[] {
  const forms: string[] = [];
  if (article && spanish.toLowerCase().startsWith(article.toLowerCase() + " ")) {
    forms.push(spanish.slice(article.length).trim());
  }
  return forms;
}
