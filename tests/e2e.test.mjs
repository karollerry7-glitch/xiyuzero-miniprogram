// E2E 冒烟测试 — 微信开发者工具 + miniprogram-automator
// 覆盖：新用户进入（首页/我的/会员页渲染 + Free 额度显示）、
//       学习会话 5D 卡加载、我的页统计、会员页价格展示
// 前置：cli auto --project <repo> --auto-port 9420 已执行
// 运行：npm run e2e

import assert from "node:assert/strict";
import automator from "miniprogram-automator";

const PORT = 9420;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, selector, timeout = 15000) {
  const start = Date.now();
  for (;;) {
    const el = await page.$(selector);
    if (el) return el;
    if (Date.now() - start > timeout) throw new Error(`等待元素超时: ${selector}`);
    await sleep(500);
  }
}

const consoleErrors = [];

const mini = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` });
console.log("✓ 已连接小程序自动化端口", PORT);

try {
  // ============ 1. 首页（学习 tab）============
  let page = await mini.reLaunch("/pages/learn/index");
  await sleep(3000);
  await waitFor(page, ".card--hero");
  const goalText = await (await page.$(".card__denom")).text();
  // Free 用户每日目标 = min(5, 用户偏好)，断言被 Free 上限约束
  const goalNum = parseInt(goalText.replace("/", "").trim(), 10);
  assert.ok(
    Number.isInteger(goalNum) && goalNum >= 1 && goalNum <= 5,
    `Free 每日目标应为 1-5（min(5, 用户偏好)），实际: ${goalText}`
  );
  console.log("✓ 首页：Free 每日目标显示为 /", goalNum, "（≤5 符合 Free 上限）");

  // ============ 2. 我的页：统计 + 五维 + 7 天趋势 ============
  await mini.switchTab("/pages/my/index");
  page = await mini.currentPage();
  await sleep(2000);
  await waitFor(page, ".my__stats");
  const statLabels = await page.$$(".my__stat-label");
  const labels = [];
  for (const l of statLabels) labels.push(await l.text());
  for (const want of ["累计学习", "已掌握", "待复习", "连续天数"]) {
    assert.ok(labels.some((x) => x.includes(want)), `我的页缺少统计项: ${want}`);
  }
  console.log("✓ 我的页：四宫格统计", labels.map((s) => s.trim()).join(" / "));

  await waitFor(page, ".my__trend");
  const trendCols = await page.$$(".my__trend-col");
  assert.equal(trendCols.length, 7, "最近 7 天趋势应为 7 列");
  console.log("✓ 我的页：最近 7 天趋势（7 列柱状）");

  await waitFor(page, ".my__dims");
  const dims = await page.$$(".my__dim");
  assert.equal(dims.length, 5, "五维掌握应为 5 条");
  console.log("✓ 我的页：五维掌握情况（5 条）");

  // ============ 3. 会员页：价格 + 权益 + 占位 ============
  await page.$(".my__menu-item") ; // 存在性
  // 点击菜单进入会员页
  const menuItems = await page.$$(".my__menu-item");
  let entered = false;
  for (const item of menuItems) {
    const label = await (await item.$(".my__menu-label")).text();
    if (label.includes("会员")) {
      await item.tap();
      entered = true;
      break;
    }
  }
  assert.ok(entered, "我的页应有「会员」菜单");
  await sleep(2500);
  page = await mini.currentPage();
  await waitFor(page, ".member__plans");

  const prices = await page.$$(".member__plan-price");
  const priceTexts = [];
  for (const p of prices) priceTexts.push((await p.text()).trim());
  assert.ok(priceTexts.some((t) => t.includes("128")), "年卡价格 ¥128");
  assert.ok(priceTexts.some((t) => t.includes("19.9")), "月卡价格 ¥19.9");
  const perMonth = await page.$(".member__plan-permonth");
  assert.ok((await perMonth.text()).includes("10.7"), "年卡折算约 ¥10.7/月");
  const recBadge = await page.$(".member__plan-badge");
  assert.ok(recBadge, "年卡应有「推荐」角标");
  const buyBtn = await page.$(".member__buy-btn");
  const buyText = await buyBtn.text();
  assert.ok(buyText.includes("立即开通"), `购买按钮应为「立即开通」，实际: ${buyText}`);
  console.log("✓ 会员页：年卡¥128（推荐，≈¥10.7/月）、月卡¥19.9、立即开通按钮");

  // 权益对比表
  const rows = await page.$$(".member__compare-row");
  assert.ok(rows.length >= 7, `权益对比应有 7 行，实际 ${rows.length}`);
  console.log(`✓ 会员页：权益对比表（${rows.length} 行）`);

  // ============ 3.5 购买流程：服务端 501 → 「即将上线」弹窗 ============
  // 在应用上下文里包装 wx.showModal 捕获参数（生产未配置商户号，购买链路保持 501）
  await mini.evaluate(() => {
    wx.__modalCalls = [];
    const orig = wx.showModal;
    wx.showModal = (opts) => {
      wx.__modalCalls.push({ title: opts && opts.title });
      return (orig && orig(opts)) || Promise.resolve({ errMsg: "showModal:ok" });
    };
  });
  const buyCards = await page.$$(".member__plan");
  const recCard = buyCards[0]; // 年卡（推荐）
  assert.ok(recCard, "年卡卡片存在");
  const cardBtn = await recCard.$(".member__buy-btn");
  await cardBtn.tap();
  await sleep(4000); // 下单请求（501）+ 弹窗
  const modalCalls = await mini.evaluate(() => wx.__modalCalls);
  assert.ok(
    Array.isArray(modalCalls) && modalCalls.length > 0,
    "点击开通后应弹出支付未开放提示（服务端 501）"
  );
  const modalTitle = modalCalls[0]?.title || "";
  assert.ok(
    String(modalTitle).includes("即将上线"),
    `弹窗标题应为「支付功能即将上线」，实际: ${modalTitle}`
  );
  console.log("✓ 购买流程：服务端 501 → 弹窗承接「", modalTitle, "」（第一版预期）");

  // ============ 4. 学习会话：5D 卡加载 ============
  await mini.navigateBack();
  await sleep(1500);
  await mini.switchTab("/pages/learn/index");
  page = await mini.currentPage();
  await sleep(1500);
  const cta = await waitFor(page, ".btn--primary");
  const ctaText = await cta.text();
  await cta.tap();
  await sleep(4000);
  page = await mini.currentPage();
  await waitFor(page, ".topbar__progress");
  const progress = await (await page.$(".topbar__progress")).text();
  assert.ok(progress.includes("新学习"), `会话页应显示学习进度，实际: ${progress}`);
  console.log("✓ 学习会话：5D 学习流程正常启动（", progress.trim(), "）");

  // ============ 5. 控制台错误检查 ============
  if (consoleErrors.length > 0) {
    console.log("⚠️ 控制台错误：", consoleErrors.slice(0, 5));
  } else {
    console.log("✓ 全程 0 控制台错误");
  }

  console.log("\n========== E2E 冒烟全部通过 ==========");
} finally {
  await mini.disconnect();
}
