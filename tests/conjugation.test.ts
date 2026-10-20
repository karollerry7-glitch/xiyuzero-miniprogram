// 动词变位排版解析测试 — 覆盖真实词库的全部变位行格式
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { parseConjugation } from "../src/shared/conjugation.js";

test("解析生成器产出的标准变位行（含尾注）", () => {
  const b = parseConjugation(
    "变位：yo soy, tú eres, él es, nosotros somos, vosotros sois, ellos son。表示身份、国籍、职业、特性。"
  );
  assert.ok(b);
  assert.equal(b!.title, "变位");
  assert.equal(b!.rows.length, 6);
  assert.deepEqual(b!.rows[0], { pronoun: "yo", form: "soy" });
  assert.deepEqual(b!.rows[5], { pronoun: "ellos", form: "son" });
  assert.equal(b!.note, "表示身份、国籍、职业、特性");
});

test("解析「现在时变位」行（无尾注）", () => {
  const b = parseConjugation(
    "现在时变位：yo trabajo, tú trabajas, él trabaja, nosotros trabajamos, vosotros trabajáis, ellos trabajan"
  );
  assert.ok(b);
  assert.equal(b!.rows.length, 6);
  assert.equal(b!.note, undefined);
  assert.deepEqual(b!.rows[2], { pronoun: "él", form: "trabaja" });
});

test("解析词干变化/反身动词/斜杠分隔/复合尾注", () => {
  const stem = parseConjugation("e→ie 词干变化：yo quiero, tú quieres, él quiere。querer + 动词 = 想做。");
  assert.ok(stem);
  assert.equal(stem!.note, "querer + 动词 = 想做");

  const refl = parseConjugation("反身动词：yo me levanto, tú te levantas, él se levanta。");
  assert.ok(refl);
  assert.deepEqual(refl!.rows[0], { pronoun: "yo", form: "me levanto" });

  const slash = parseConjugation("llamarse 是反身动词：yo me llamo / tú te llamas / él se llama。");
  assert.ok(slash);
  assert.equal(slash!.rows.length, 3);
  assert.deepEqual(slash!.rows[1], { pronoun: "tú", form: "te llamas" });
});

test("非变位语法行回退 null（不误解析）", () => {
  // 无冒号
  assert.equal(parseConjugation("动词原形（-ir 类），变位后使用"), null);
  // 人称不在白名单
  assert.equal(parseConjugation("ser 和 estar：ser 表示本质，estar 表示状态。"), null);
  // 单数/复数描述（costar 特例）
  assert.equal(
    parseConjugation("costar 是 o→ue 动词：单数（él/ella）cuesta、复数（ellos/ellas）cuestan。"),
    null
  );
  // 空串
  assert.equal(parseConjugation(""), null);
});
