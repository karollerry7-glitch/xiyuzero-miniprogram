// E2E 打卡链路 — 学完当日目标新词 → 自动进入星轨打卡页
// 复现并防护用户反馈：「学习完新单词之后打卡失败」
// 流程：游客模式 → 设每日目标 5 → 5D 学习完成 5 词 → 断言落在 pages/orbit/index
// 前置：cli auto --project <repo> --auto-port 9420 已执行

import assert from "node:assert/strict";
import automator from "miniprogram-automator";

const PORT = 9420;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, selector, timeout = 20000) {
  const start = Date.now();
  for (;;) {
    const el = await page.$(selector);
    if (el) return el;
    if (Date.now() - start > timeout) throw new Error(`等待元素超时: ${selector}`);
    await sleep(500);
  }
}

const mini = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` });
console.log("✓ 已连接小程序自动化端口", PORT);

try {
  // ============ 防污染护栏：游客模式 + 清空本地存储 ============
  await mini.callWxMethod("clearStorageSync");
  // 游客目标设为 5 词（默认 20 会拉长测试时间）
  await mini.callWxMethod(
    "setStorageSync",
    "xz_prefs",
    JSON.stringify({ startLevel: "A1", dailyNew: 5 })
  );
  console.log("✓ 游客模式，每日目标 = 5");

  // ============ 进入学习会话 ============
  let page = await mini.reLaunch("/pages/learn/index");
  await sleep(3000);
  await waitFor(page, ".card--hero");
  const cta = await waitFor(page, ".btn--primary");
  await cta.tap();
  await sleep(4000);
  const sessionPage = await mini.currentPage();
  assert.equal(sessionPage.path, "pages/session/index", "应进入学习会话");
  console.log("✓ 进入 5D 学习会话");

  // ============ 完成 5 个词的 5D 流程 ============
  // 每词：5 步「下一步」→ recall 输入任意 → 检查答案 → 评分（再来一次）
  for (let w = 1; w <= 5; w++) {
    // 5 步卡：step0-4 各一个 .btn-main（step4 文案为「我学会了，开始回忆 →」）
    for (let s = 0; s < 5; s++) {
      const btn = await waitFor(sessionPage, ".card .btn-main");
      await btn.tap();
      await sleep(900);
    }
    // recall：输入 + 检查
    const progress = await (await waitFor(sessionPage, ".topbar__progress")).text();
    const input = await waitFor(sessionPage, ".recall__input");
    await input.input("test");
    await sleep(300);
    const checkBtn = await waitFor(sessionPage, ".btn-main--dark");
    await checkBtn.tap();
    await sleep(1200); // 反馈出现 + 350ms 防连击窗口
    // 评分：点第一个「再来一次」
    const rate = await waitFor(sessionPage, ".ratings__btn");
    await rate.tap();
    await sleep(1500);
    console.log(`  ✓ 第 ${w}/5 词完成 (${progress.trim()})`);
  }

  // ============ 断言：自动进入星轨打卡页 ============
  await sleep(2000);
  const finalPage = await mini.currentPage();
  assert.equal(
    finalPage.path,
    "pages/orbit/index",
    `学完 5 个新词后应自动进入打卡页，实际: ${finalPage.path}`
  );
  await waitFor(finalPage, ".orbit__title");
  const orbitTitle = await (await finalPage.$(".orbit__title")).text();
  assert.ok(orbitTitle.includes("今日已完成"), `打卡页标题异常: ${orbitTitle}`);
  console.log("✓ 学完目标新词后自动进入星轨打卡页，页面渲染正常");

  // 打卡页核心数据渲染
  await waitFor(finalPage, ".orbit__phrase-zh");
  const phrase = await (await finalPage.$(".orbit__phrase-zh")).text();
  assert.ok(phrase.includes("今日学习完成"), `完成文案异常: ${phrase}`);
  console.log("\n========== 打卡链路 E2E 全部通过 ==========");
} finally {
  await mini.disconnect();
}
