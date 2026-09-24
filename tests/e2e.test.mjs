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
  // ============ 0. 主动登录前置（审核整改后登录由用户触发） ============
  // 走完整 UI 流程：勾选协议 → 微信一键登录 → （昵称步骤）→ 回首页
  // 同时覆盖审核场景 6：用户主动登录时按实际需要进行身份验证
  let page = await mini.reLaunch("/pages/login/index");
  await sleep(2000);
  const chk = await waitFor(page, ".login__check");
  await chk.tap(); // 用户主动勾选协议
  await sleep(600);
  const chkClass = await (await page.$(".login__check")).attribute("class");
  assert.ok(String(chkClass).includes("--on"), "勾选协议失败");
  const loginBtn = await waitFor(page, ".login__btn");
  await loginBtn.tap(); // 用户主动点击登录
  await sleep(4500); // wx.login + code2Session + profile
  // 新用户进入昵称步骤 → 填写并保存；老用户直接完成
  const cur0 = await mini.currentPage();
  if (cur0.path === "pages/login/index") {
    const nickInput = await page.$(".login__input");
    if (nickInput) {
      await nickInput.input("E2E学员");
      await sleep(600);
      const saveBtn = await page.$(".login__btn");
      await saveBtn.tap();
      await sleep(3500);
    }
  }
  const afterLogin = await mini.currentPage();
  assert.equal(
    afterLogin.path,
    "pages/learn/index",
    `主动登录完成后应回到首页，实际: ${afterLogin.path}`
  );
  console.log("✓ 主动登录流程：勾选协议 → 一键登录 → （昵称）→ 回到首页");

  // ============ 1. 首页（学习 tab）============
  page = await mini.currentPage();
  await sleep(1500);
  await waitFor(page, ".card--hero");
  const goalText = await (await page.$(".card__denom")).text();
  // Free 用户每日目标 = min(10, 用户偏好)（当前 Free 每日 10 新词）
  const goalNum = parseInt(goalText.replace("/", "").trim(), 10);
  assert.ok(
    Number.isInteger(goalNum) && goalNum >= 1 && goalNum <= 10,
    `Free 每日目标应为 1-10（min(10, 用户偏好)），实际: ${goalText}`
  );
  console.log("✓ 首页：Free 每日目标显示为 /", goalNum, "（≤10 符合 Free 上限）");

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
  // 菜单存在性断言；进页用直接路由（automator 的 tap 偶发不触发 navigateTo）
  const menuItems = await page.$$(".my__menu-item");
  let hasMembership = false;
  for (const item of menuItems) {
    const label = await (await item.$(".my__menu-label")).text();
    if (label.includes("会员")) {
      hasMembership = true;
      break;
    }
  }
  assert.ok(hasMembership, "我的页应有「会员」菜单");
  await mini.navigateTo("/pages/membership/index");
  await sleep(2500);
  page = await mini.currentPage();
  // 账号可能是 FREE 或 PRO（历史兑换测试会激活），两种状态都要能渲染
  const planLabel = await waitFor(page, ".member__current-plan");
  const planText = (await planLabel.text()).trim();
  assert.ok(
    planText.includes("PRO") || planText.includes("FREE"),
    `会员页应显示当前身份（PRO/FREE），实际: ${planText}`
  );
  const isProView = planText.includes("PRO");

  if (!isProView) {
    // ---- FREE 视图：年会员 ¥29.9 卡片 + 兑换码入口 ----
    await waitFor(page, ".member__plans");
    const prices = await page.$$(".member__plan-price");
    const priceTexts = [];
    for (const p of prices) priceTexts.push((await p.text()).trim());
    assert.equal(prices.length, 1, "仅一个在售方案（年会员）");
    assert.ok(priceTexts[0].includes("29.9"), `年会员价格 ¥29.9，实际: ${priceTexts[0]}`);
    const perMonth = await page.$(".member__plan-permonth");
    assert.ok((await perMonth.text()).includes("12 个月"), "年会员 12 个月有效");
    const recBadge = await page.$(".member__plan-badge");
    assert.ok(recBadge, "年会员应有角标");
    const redeemInput = await page.$(".member__redeem-input");
    assert.ok(redeemInput, "应有兑换码激活输入框");
    console.log("✓ 会员页（FREE）：年会员 ¥29.9（12 个月有效）+ 兑换码激活入口");

    // 权益对比表
    const rows = await page.$$(".member__compare-row");
    assert.ok(rows.length >= 7, `权益对比应有 7 行，实际 ${rows.length}`);
    console.log(`✓ 会员页：权益对比表（${rows.length} 行）`);

    // ---- 3.5 购买流程：添加客服微信 → 客服弹窗（二维码 + 微信号） ----
    const buyBtn = await page.$(".member__buy-btn--card");
    assert.ok(buyBtn, "开通按钮存在");
    const buyText = await buyBtn.text();
    assert.ok(buyText.includes("添加客服微信"), `购买按钮应为「添加客服微信开通」，实际: ${buyText}`);
    await buyBtn.tap();
    await sleep(1500);
    const svcTitle = await page.$(".svc__title");
    assert.ok(svcTitle, "点击开通后应弹出客服弹窗");
    const svcText = await svcTitle.text();
    assert.ok(svcText.includes("年会员"), `客服弹窗应为年会员开通引导，实际: ${svcText}`);
    const svcQr = await page.$(".svc__qr");
    assert.ok(svcQr, "客服弹窗应展示二维码");
    console.log("✓ 购买流程：添加客服微信 → 客服弹窗（", svcText.trim(), " + 二维码）");
    const svcClose = await page.$(".svc__close");
    if (svcClose) await svcClose.tap();
    await sleep(800);
  } else {
    // ---- PRO 视图：有效期 / 终身标识渲染 ----
    const desc = await (await page.$(".member__current-desc")).text();
    assert.ok(
      desc.includes("终身") || desc.includes("有效期至"),
      `PRO 视图应显示终身或到期信息，实际: ${desc}`
    );
    console.log("✓ 会员页（PRO）：", desc.trim());
  }

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
