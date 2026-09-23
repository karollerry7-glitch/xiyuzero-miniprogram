// E2E 布局验证 — 星轨打卡页单屏适配（375×667 / 375×812 / 430×932）
// 前置：cli auto --auto-port 9420 已执行
// 方法：
//   1) 真实视口实测：各模块渲染高度 + 品牌底部 ≤ 窗口高度（无裁切/无滚动）
//   2) 尺寸模拟：mock getSystemInfoSync 后 reLaunch，页面按目标尺寸计算星轨；
//      固定模块高度在等宽下不变（rpx 布局），异宽按 rpx 比例折算 →
//      校验「padTop + Σ模块高 + 安全区 ≤ 目标窗口高度」
// 运行：node tests/e2e-orbit-layout.mjs

import assert from "node:assert/strict";
import automator from "miniprogram-automator";

const PORT = 9420;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mini = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${PORT}` });
console.log("✓ 已连接小程序自动化端口", PORT);

async function waitFor(page, selector, timeout = 15000) {
  const start = Date.now();
  for (;;) {
    const el = await page.$(selector);
    if (el) return el;
    if (Date.now() - start > timeout) throw new Error(`等待元素超时: ${selector}`);
    await sleep(400);
  }
}

async function rect(page, selector) {
  const el = await waitFor(page, selector);
  const size = await el.size();
  const offset = await el.offset();
  return { top: offset.top, height: size.height, bottom: offset.top + size.height };
}

try {
  const sys = await mini.systemInfo();
  console.log(`视口：${sys.windowWidth}×${sys.windowHeight}（statusBar ${sys.statusBarHeight}px）`);

  // ---- 造数：10 词星轨 + 昵称 ----
  const todayUTC = new Date().toISOString().slice(0, 10);
  await mini.evaluate((d) => {
    const words = [
      ["la-casa", "la casa", "家"], ["el-sol", "el sol", "太阳"], ["la-luz", "la luz", "光"],
      ["el-mar", "el mar", "海"], ["la-noche", "la noche", "夜晚"], ["el-dia", "el día", "白天"],
      ["la-puerta", "la puerta", "门"], ["el-libro", "el libro", "书"], ["la-vida", "la vida", "生活"],
      ["el-mundo", "el mundo", "世界"],
    ].map(([id, spanish, chinese]) => ({ id, spanish, chinese }));
    wx.setStorageSync("xz_orbit_words", JSON.stringify({ date: d, words, savedAt: Date.now() }));
    wx.setStorageSync("xz_user", JSON.stringify({ id: "e2e", nickname: "星轨体验官", avatar: null, isNew: false }));
  }, todayUTC);

  let page = await mini.reLaunch("/pages/orbit/index");
  await sleep(3500);

  // ---- 内容断言 ----
  const greetName = await (await waitFor(page, ".orbit__greet-name")).text();
  assert.ok(greetName.includes("星轨体验官"), `问候昵称应显示已存昵称，实际: ${greetName}`);
  const greetSub = await (await page.$(".orbit__greet-sub")).text();
  assert.ok(greetSub.includes("词轨已经点亮"), `副文案缺失: ${greetSub}`);
  const coreNum = await (await page.$(".so__core-num")).text();
  assert.equal(coreNum.trim(), "10", "中央数字应为 10");
  const starLabels = await page.$$(".so__star-label");
  assert.equal(starLabels.length, 10, "词星应为 10 颗");
  const phraseZh = await (await page.$(".orbit__phrase-zh")).text();
  assert.ok(phraseZh.includes("今日学习完成"), `完成文案缺失: ${phraseZh}`);
  const statTexts = [];
  for (const s of await page.$$(".orbit__stat")) statTexts.push(await s.text());
  assert.ok(statTexts.join(" ").includes("连续学习"), "数据栏应有「连续学习」");
  assert.ok(statTexts.join(" ").includes("本周累计"), "数据栏应有「本周累计」");
  const quoteLines = await page.$$(".orbit__quote-es, .orbit__quote-zh");
  assert.equal(quoteLines.length, 2, "记忆句应只有两行");
  const btns = await page.$$(".orbit__btn");
  assert.equal(btns.length, 2, "操作区应为两个横排按钮");
  const brandMain = await (await page.$(".orbit__brand-main")).text();
  assert.ok(brandMain.includes("沃天岚"), "品牌主名称应为「沃天岚」");
  const brandTag = await (await page.$(".orbit__brand-tag")).text();
  assert.ok(brandTag.includes("每天认识一点新的世界"), `品牌标语缺失: ${brandTag}`);
  console.log("✓ 内容：昵称问候 / 10 词星轨 / 完成信息 / 横排数据 / 两行记忆句 / 双按钮 / 品牌署名");

  // ---- 真实视口单屏断言 ----
  // 说明：自定义导航页 100vh = 完整 webview 视口（root 实测高度），
  // systemInfo.windowHeight 在 devtools 下不代表渲染视口，故以 root 高度为准。
  const brand = await rect(page, ".orbit__brand");
  const rootEl = await page.$(".orbit");
  const rootSize = await rootEl.size();
  const vhViewport = rootSize.height;
  assert.ok(
    brand.bottom <= vhViewport + 1,
    `品牌底部 ${brand.bottom}px 超出视口 ${vhViewport}px`
  );
  console.log(
    `✓ 真实视口单屏：视口高 ${vhViewport}px / 品牌底 ${brand.bottom}px（含底部安全区贴齐，无滚动无裁切）`
  );

  // ---- 模块高度采集（flex:1 仅星轨区，其余为最小内容高度） ----
  const visualRect = await rect(page, ".orbit__visual");
  const soRect = await rect(page, ".so");
  const navInner = await rect(page, ".orbit__nav-inner");

  // ---- 三尺寸模拟校验 ----
  // mock getSystemInfoSync → 页面据此计算 padTop / orbitSize / compact；
  // 渲染仍在真实视口（宽度比例折算）。星轨区是唯一 flex:1（富余高度吸收器），
  // 故「最小内容高度」= brand.bottom - (visual - so 的吸收量)。
  const realW = sys.windowWidth;
  const DEVICES = [
    { name: "375×667（iPhone 8）", w: 375, h: 667, status: 20, safe: 0 },
    { name: "375×812（iPhone X）", w: 375, h: 812, status: 44, safe: 34 },
    { name: "430×932（Pro Max）", w: 430, h: 932, status: 47, safe: 34 },
  ];

  for (const d of DEVICES) {
    await mini.mockWxMethod("getSystemInfoSync", {
      windowWidth: d.w,
      windowHeight: d.h,
      statusBarHeight: d.status,
      pixelRatio: 2,
      screenWidth: d.w,
      screenHeight: d.h,
    });
    page = await mini.reLaunch("/pages/orbit/index");
    await sleep(3000);
    const brandNow = await rect(page, ".orbit__brand");
    const visualNow = await rect(page, ".orbit__visual");
    const soNow = await rect(page, ".so");
    const navInnerNow = await rect(page, ".orbit__nav-inner");
    // 最小内容底部（扣除 flex 吸收的富余）
    const minBottom = brandNow.bottom - (visualNow.height - soNow.height);
    const scale = d.w / realW;
    const need =
      d.status + // 目标状态栏
      (minBottom - navInnerNow.top) * scale + // 固定模块（rpx 按宽度折算）
      10 * (d.w / 750) + // 底部内边距 10rpx
      d.safe; // 底部安全区
    const slack = d.h - need;
    assert.ok(
      slack >= 0,
      `${d.name} 需 ${Math.round(need)}px > 窗口 ${d.h}px（溢出 ${Math.round(-slack)}px）`
    );
    console.log(
      `✓ ${d.name}：最小需 ${Math.round(need)}px ≤ ${d.h}px（余量 ${Math.round(slack)}px，星轨 ${Math.round(soNow.height * scale)}px）`
    );
  }

  await mini.restoreWxMethod("getSystemInfoSync");

  console.log("\n========== 三尺寸单屏验证全部通过 ==========");
} finally {
  await mini.disconnect();
}
