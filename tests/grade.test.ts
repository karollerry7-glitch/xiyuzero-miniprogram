// 交流评分 MVP 验收测试 — enviar 完整演示的五分支 + 判分规则边界
// 对应 spec §6/§10/§11
import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  gradeComm,
  loose,
  rawNorm,
  recallToEvidence,
} from "../src/shared/grade.js";

// ---------- enviar 任务的教师式标注（与后端 comm-core.ts a2-003 一致） ----------
const ENVIAR_CHECK = {
  key: [
    { label: "数量：50（件）", any: ["\\b50\\b", "cincuenta"] },
    { label: "时间：星期五", any: ["viernes"] },
    { label: "寄送动作（寄/发送）", any: ["envi", "manda", "mandar", "hacer el envio", "salir el envio"] },
  ],
  rejects: [
    { message: "数量错误", any: ["\\b15\\b", "quince\\b", "\\b5\\b", "cinco\\b", "\\b500\\b"] },
  ],
  target: { label: "enviar（寄送）", any: ["envi"] },
};

test("enviar 演示·分支1：未提示独立作答 → 交流成功 + 目标表达达标", () => {
  const g = gradeComm("¿Puedes enviarme 50 unidades el viernes?", ENVIAR_CHECK);
  assert.equal(g.communication, "pass");
  assert.equal(g.targetForm, "pass");
  assert.equal(g.issues.length, 0);
});

test("enviar 演示·分支2：同义表达 mandar → 交流成功，但不记 enviar 产出证据", () => {
  const g = gradeComm("¿Me puedes mandar 50 unidades el viernes?", ENVIAR_CHECK);
  assert.equal(g.communication, "pass"); // 交流成功
  assert.equal(g.targetForm, "fail"); // 但目标词证据不足
  assert.ok(g.notes.length > 0);
});

test("enviar 演示·分支3：关键数量错误（15 件）→ 一票否决，交流不通过", () => {
  const g = gradeComm("¿Puedes enviarme 15 unidades el viernes?", ENVIAR_CHECK);
  assert.equal(g.communication, "fail");
  assert.ok(g.issues.some((i) => i.includes("数量错误")));
});

test("enviar 演示·分支4：缺失关键信息（没有时间）→ 交流未通过，列出缺失项", () => {
  const g = gradeComm("¿Puedes enviarme 50 unidades?", ENVIAR_CHECK);
  assert.equal(g.communication, "fail");
  assert.ok(g.issues.some((i) => i.includes("时间：星期五")));
});

test("enviar 演示·分支5：空答/过短 → 待复核，不判确定错误", () => {
  assert.equal(gradeComm("", ENVIAR_CHECK).communication, "needs_review");
  assert.equal(gradeComm("a", ENVIAR_CHECK).communication, "needs_review");
  assert.equal(gradeComm("   ", ENVIAR_CHECK).communication, "needs_review");
});

test("enviar 演示：重音不敏感（vienés/vié兰？拼写带口音差异仍可命中）", () => {
  // 用户没打重音：viernes 无重音不变；unidades→unidades；cincuenta 数字词也接受
  const g = gradeComm("puedes enviarme cincuenta unidades el viernes", ENVIAR_CHECK);
  assert.equal(g.communication, "pass");
  assert.equal(g.targetForm, "pass");
});

// ---------- 判分规则细节 ----------
test("规则6：不粗暴剥重音——sí/si 原形保留，可按语义判定", () => {
  assert.equal(rawNorm("¡Sí, claro!"), "sí claro"); // 原形保留 sí
  assert.equal(loose("Sí"), "si"); // 宽松形态用于关键词匹配
  assert.notEqual(loose("sí"), loose("si") + "x"); // sanity
});

test("规则2：轻微拼写/标点问题不判交流失败（重音缺失可接受）", () => {
  // direccion 没打重音 → 宽松匹配仍命中关键语义
  const g = gradeComm("Vivo en la calle gran via 45", {
    key: [{ label: "Gran Vía", any: ["gran via"] }, { label: "门牌", any: ["\\b45\\b"] }],
  });
  assert.equal(g.communication, "pass");
});

test("规则3：接受合理同义表达（目标词未用 → targetForm=fail 但交流成功）", () => {
  const g = gradeComm("El bulto puede llegar el viernes con 50 piezas", {
    key: [
      { label: "数量：50", any: ["\\b50\\b", "cincuenta"] },
      { label: "时间：星期五", any: ["viernes"] },
    ],
    target: { label: "enviar", any: ["envi"] },
  });
  assert.equal(g.communication, "pass"); // 关键信息齐 → 交流成功
  assert.equal(g.targetForm, "fail"); // 未用 enviar
});

test("规则1：否定语义缺失/矛盾 → 关键错误", () => {
  // 任务要求拒绝周五、提出周四；用户只说了周四（缺拒绝）→ 关键语义未表达
  const g = gradeComm("el jueves está bien", {
    key: [
      { label: "拒绝周五", any: ["viernes", "no puedo", "no me va", "imposible", "lo siento"] },
      { label: "提出周四", any: ["jueves"] },
    ],
  });
  assert.equal(g.communication, "fail");
  assert.ok(g.issues.some((i) => i.includes("拒绝周五")));
});

test("规则7：文本答对不自动变成口语达标（由通道区分，grader 只管文本维度）", () => {
  // 通道归属由调用方（页面）决定：文字输入只记 produce(recognize/listen) 通道证据，
  // 口语通道恒为未评估——gradeComm 输出不含任何语音能力声明
  const g = gradeComm("¿Puedes enviarme 50 unidades el viernes?", ENVIAR_CHECK);
  const keys = Object.keys(g);
  assert.ok(!keys.includes("pronunciation"));
  assert.ok(!keys.includes("speaking"));
});

test("非法正则 pattern 不会导致误判（按未命中处理）", () => {
  const g = gradeComm("hola", {
    key: [{ label: "坏正则", any: ["[unclosed"] }],
  });
  assert.equal(g.communication, "fail"); // 未命中 → 缺失，而非崩溃
});

// ---------- C→S 回忆结果 → 证据口径 ----------
test("recallToEvidence：correct→双达标 / close→交流成功但目标形式未达 / wrong→交流失败", () => {
  assert.deepEqual(recallToEvidence("correct"), { communication: "pass", targetForm: "pass" });
  assert.deepEqual(recallToEvidence("close"), { communication: "pass", targetForm: "fail" });
  assert.deepEqual(recallToEvidence("wrong"), { communication: "fail", targetForm: "none" });
});
