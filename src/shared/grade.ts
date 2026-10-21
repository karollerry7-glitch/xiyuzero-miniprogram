// ============================================================
// 交流评分 MVP（规则式，无 AI）
// — 对应 spec §6「交流评分：关键条件逐项判断」
//
// 判据分三维，关键错误不可被其他得分抵消：
//   A. 任务完成  → communication（pass / fail / needs_review）
//   B. 关键意思  → 关键语义检查（数量、时间、否定等；缺失或错误 → fail）
//   C. 可理解性  → 空答/过短/无法解析 → needs_review（不判确定错误）
//   E. 目标表达  → targetForm（未用目标词 = fail：交流可成功，但不记目标词证据）
//   F. 独立性    → 由调用方（页面）根据提示揭示情况传入 independent
//
// 不粗暴剥离重音做字符串判定：规范化保留 ñ 与重音差异的原始形态用于 sí/si 类判定，
// 数字与关键词匹配用「重音不敏感」的第二形态。轻微拼写/标点错误不判交流失败。
// ============================================================

// ============ 类型 ============

/** 关键语义：必须命中的信息（任一 pattern 即命中） */
export interface KeySemantic {
  /** 展示名（反馈用），如「数量：50」 */
  label: string;
  /** 命中任一即算表达（重音不敏感、小写化） */
  any: string[];
}

/** 目标表达：本题欲验证的词/词块/形式 */
export interface TargetForm {
  label: string;
  /** 命中任一即算恰当使用 */
  any: string[];
}

/** 关键错误守卫：命中即一票否决（如错误数量） */
export interface RejectRule {
  message: string;
  /** 命中任一即触发（重音不敏感） */
  any: string[];
}

/** 一次交流任务的判分规则（由后端下发，教师式标注） */
export interface CommCheck {
  /** 必须全部命中的关键语义 */
  key: KeySemantic[];
  /** 命中任一 → 关键错误，交流不通过（放在 key 检查之前） */
  rejects?: RejectRule[];
  /** 目标表达（可选：听力/理解类可不考察） */
  target?: TargetForm;
}

export interface CommGrade {
  /** 交流是否成功（意思是否表达清楚、交流能否继续） */
  communication: "pass" | "fail" | "needs_review";
  /** 目标表达是否被实际、恰当地使用 */
  targetForm: "pass" | "fail" | "none";
  /** 关键问题（数量/时间/否定错误、缺失信息）——影响判定 */
  issues: string[];
  /** 轻微问题（不影响交流） */
  notes: string[];
}

// ============ 文本规范化 ============

/** 重音不敏感形态：小写 + 去重音（á→a、ü→u；ñ→n 仅用于宽松匹配，sí/si 判定另走原形） */
export function loose(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¡!¿?.,;:"'()…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 保留重音的原形（sí ≠ si 判定用）：只做小写与标点清理 */
export function rawNorm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[¡!¿?.,;:"'()…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hitAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    try {
      return new RegExp(p, "i").test(text);
    } catch {
      return false; // 非法正则按未命中处理（数据错误不应导致误判）
    }
  });
}

// ============ 判分 ============

export function gradeComm(input: string, check: CommCheck): CommGrade {
  const looseText = loose(input);
  const issues: string[] = [];
  const notes: string[] = [];

  // C. 可理解性：空答 / 过短 → 待复核（不是确定错误，不自动通过）
  if (!looseText || looseText.length < 3) {
    return { communication: "needs_review", targetForm: "none", issues: ["答案为空或过短，无法判断"], notes };
  }

  // A/B. 关键错误守卫：数量、否定等硬伤一票否决
  for (const r of check.rejects ?? []) {
    if (hitAny(looseText, r.any)) {
      issues.push(r.message);
      return { communication: "fail", targetForm: "none", issues, notes };
    }
  }

  // B. 关键语义：必须全部命中（缺失 = 任务未完成）
  for (const k of check.key) {
    if (!hitAny(looseText, k.any)) {
      issues.push(`未表达关键信息：${k.label}`);
    }
  }
  if (issues.length > 0) {
    return { communication: "fail", targetForm: "none", issues, notes };
  }

  // E. 目标表达：交流成功的前提下单独判定
  let targetForm: CommGrade["targetForm"] = "none";
  if (check.target) {
    targetForm = hitAny(looseText, check.target.any) ? "pass" : "fail";
    if (targetForm === "fail") {
      notes.push(`交流成功，但目标表达「${check.target.label}」未使用——本题不记该词的主动产出证据`);
    }
  }

  // 轻微问题：句子过短但关键信息齐全（A1 短回应合法）不扣分；
  // 无大小写/标点要求（西语口语中 ¿ ¡ 书面可省）
  return { communication: "pass", targetForm, issues, notes };
}

// ============ 通道判定辅助 ============

/** 把字符串比对结果（C→S 回忆/听写）转成证据口径：
 *  correct → 交流成功 + 目标形式达标
 *  close   → 交流成功（轻微拼写不判交流失败）+ 目标形式单独未达标（错在本题目标上）
 *  wrong   → 交流失败 */
export function recallToEvidence(result: "correct" | "close" | "wrong"): {
  communication: "pass" | "fail";
  targetForm: "pass" | "fail" | "none";
} {
  if (result === "correct") return { communication: "pass", targetForm: "pass" };
  if (result === "close") return { communication: "pass", targetForm: "fail" };
  return { communication: "fail", targetForm: "none" };
}
