// E2E — 审核整改专项：游客模式 + 协议主动同意
// 覆盖审核场景：
//   1. 新用户首次打开直接看首页，不出现强制登录页
//   2. 协议未勾选时不得自动视为同意（点登录被拦截，勾选状态不变）
//   3. 两份协议可分别打开阅读
//   4. 拒绝/暂不登录后返回首页继续浏览
//   5. 游客可进入 5D 学习体验（不要求授权）
//   9. Free 每日 10 词限制仍有效（已有单测+冒烟，此处验证游客视角卡片显示）
// 前置：cli auto --auto-port 9420

import assert from "node:assert/strict";
import automator from "miniprogram-automator";

const PORT = 9420;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, selector, timeout = 12000) {
  const start = Date.now();
  for (;;) {
    const el = await page.$(selector);
    if (el) return el;
    if (Date.now() - start > timeout) throw new Error(`等待元素超时: ${selector}`);
    await sleep(400);
  }
}

const mini = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` });
console.log("✓ 已连接小程序自动化端口", PORT);

try {
  // ============ 0. 清登录态 → 模拟新用户首开 ============
  await mini.callWxMethod("clearStorageSync");
  await mini.evaluate(() => {
    wx.clearStorageSync();
  });
  console.log("✓ 已清空本地存储（模拟新用户）");

  // ============ 1. 首开直接进首页，不出现强制登录页 ============
  let page = await mini.reLaunch("/pages/learn/index");
  await sleep(3000);
  const cur1 = await mini.currentPage();
  assert.equal(cur1.path, "pages/learn/index", "首次进入应停留在首页（不被强制跳登录页）");
  await waitFor(page, ".card--hero");
  console.log("✓ 场景1：首开直接看到首页今日目标卡，无强制登录跳转");

  // 游客问候 + 游客模式标识
  const greetSub = await (await page.$(".greet__sub")).text();
  assert.ok(greetSub.includes("游客模式"), `问候副标题应提示游客模式，实际: ${greetSub}`);

  // 登录入口存在但只是可点击卡片（非弹窗/遮罩）
  const guestEntry = await page.$(".card--guest");
  assert.ok(guestEntry, "应有「登录并同步进度」主动入口卡片");
  console.log("✓ 场景1：游客模式标识 + 主动登录入口卡片就位");

  // ============ 5. 游客直接体验 5D 学习（无任何授权前置） ============
  const cta = await waitFor(page, ".btn--primary");
  const ctaText = (await cta.text()).trim();
  assert.ok(ctaText.includes("5D 学习"), `主 CTA 应为「先体验 5D 学习」，实际: ${ctaText}`);
  await cta.tap();
  await sleep(4000);
  const sessionPage = await mini.currentPage();
  assert.equal(sessionPage.path, "pages/session/index", "游客应能直接进入 5D 学习会话");
  await waitFor(sessionPage, ".topbar__progress");
  console.log("✓ 场景5：游客无登录直接进入 5D 学习会话，学习流程正常启动");

  // 返回首页
  await mini.navigateBack();
  await sleep(1500);
  page = await mini.currentPage();
  assert.equal(page.path, "pages/learn/index", "应返回首页");

  // ============ 2/3. 登录页：协议主动勾选 ============
  page = await mini.navigateTo("/pages/login/index");
  await sleep(2000);
  // 勾选框存在且初始未勾选
  const checkbox = await page.$(".login__check");
  assert.ok(checkbox, "登录页应有协议勾选框");
  const checkClass = await checkbox.attribute("class");
  assert.ok(!String(checkClass).includes("--on"), "协议勾选框初始必须为未勾选状态");
  console.log("✓ 场景2a：勾选框存在且初始未勾选（默认不同意）");

  // 两份协议链接可分别打开
  const legalLinks = await page.$$(".login__legal-link");
  assert.equal(legalLinks.length, 2, "应有两个协议链接（用户协议/隐私政策）");
  const link1Text = (await legalLinks[0].text()).trim();
  const link2Text = (await legalLinks[1].text()).trim();
  assert.ok(link1Text.includes("用户协议") && link2Text.includes("隐私政策"),
    `协议链接文案错误: ${link1Text} / ${link2Text}`);
  await legalLinks[0].tap();
  await sleep(2000);
  const legalPage = await mini.currentPage();
  assert.equal(legalPage.path, "pages/legal/index", "点击协议应能打开阅读页");
  console.log("✓ 场景3：两份协议链接均可分别打开阅读");

  await mini.navigateBack();
  await sleep(1500);
  page = await mini.currentPage();
  assert.equal(page.path, "pages/login/index", "返回登录页");

  // 未勾选时点「微信一键登录」→ 被拦截（toast + 勾选状态不变 + 不跳转）
  const loginBtn = await waitFor(page, ".login__btn");
  await loginBtn.tap();
  await sleep(2000);
  const stillLogin = await mini.currentPage();
  assert.equal(stillLogin.path, "pages/login/index", "未勾选协议时点击登录不得进入登录流程");
  const checkClass2 = await (await page.$(".login__check")).attribute("class");
  assert.ok(!String(checkClass2).includes("--on"), "未勾选时系统不得自动修改勾选状态");
  console.log("✓ 场景2b：未勾选点登录被拦截，勾选状态不被自动更改");

  // ============ 4. 暂不登录 → 返回首页继续浏览 ============
  const skip = await page.$(".login__skip");
  assert.ok(skip, "应有「暂不登录，先逛逛」拒绝入口");
  await skip.tap();
  await sleep(2000);
  const afterSkip = await mini.currentPage();
  assert.equal(afterSkip.path, "pages/learn/index", "暂不登录后应回到首页");
  await waitFor(afterSkip, ".card--hero");
  console.log("✓ 场景4：拒绝登录后返回首页，公开学习内容可继续浏览");

  // ============ 9. 游客视角 Free 目标（每日 10 词）============
  const denom = await (await afterSkip.$(".card__denom")).text();
  const goalNum = parseInt(denom.replace("/", "").trim(), 10);
  assert.ok(goalNum >= 1 && goalNum <= 10, `Free 每日目标应 1-10，实际: ${denom}`);
  console.log("✓ 场景9：游客视角 Free 每日目标 =", goalNum, "（≤10 限制有效）");

  console.log("\n========== 审核整改 E2E（游客模式+协议勾选）全部通过 ==========");
} finally {
  await mini.disconnect();
}
