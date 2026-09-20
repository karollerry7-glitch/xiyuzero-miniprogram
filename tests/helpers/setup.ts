// 测试环境引导 — 必须在每个测试文件的第一行 import
// 1. 定义 Taro 编译期常量（正常由 webpack DefinePlugin 注入）
// 2. 用内存存储 mock Taro storage API（模拟 wx.setStorageSync）
// 3. 提供 Taro.request 可编程 mock（模拟网络层成功/失败）
// 4. 提供"重启模拟"：清空内存存储 = 重装；保留 = App 重启

// ---- 1. Taro 编译期常量 ----
Object.assign(globalThis, {
  ENABLE_INNER_HTML: false,
  ENABLE_ADJACENT_HTML: false,
  ENABLE_SIZE_APIS: false,
  ENABLE_TEMPLATE_CONTENT: false,
  ENABLE_MUTATION_OBSERVER: false,
  ENABLE_CLONE_NODE: false,
  ENABLE_CONTAINS: false,
  ENABLE_MUTATION_OBSERVER_OR_EVENTS: false,
});
process.env.TARO_ENV = "weapp";

// ---- 2/3. 内存存储 + 可编程网络 ----
const backing = new Map<string, unknown>();
type RequestHandler = (opts: { url: string; method: string; data?: unknown }) =>
  | { statusCode: number; data: unknown }
  | Promise<{ statusCode: number; data: unknown }>;

let requestHandler: RequestHandler | null = null;

export function setRequestHandler(h: RequestHandler | null) {
  requestHandler = h;
}

/** 模拟 App 重启：存储保留（进程内存不清理 → 每次 getStorageSync 都读 backing） */
export function simulateRestart() {
  // storage.ts 无内存态，全部走 Taro mock → backing 不动即等价于重启
  return;
}

/** 模拟重装/清缓存：清空本地存储 */
export function simulateReinstall() {
  backing.clear();
}

/** 直接窥探存储（断言用） */
export function peekStorage(key: string): unknown {
  return backing.get(key);
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Taro = require("@tarojs/taro").default as typeof import("@tarojs/taro").default;

Taro.getStorageSync = (k: string) => backing.get(k) ?? "";
Taro.setStorageSync = (k: string, v: unknown) => {
  backing.set(k, v);
};
Taro.removeStorageSync = (k: string) => {
  backing.delete(k);
};
Taro.request = (opts: { url: string; method?: string; data?: unknown }) => {
  if (!requestHandler) {
    return Promise.reject(new Error("no mock handler"));
  }
  return Promise.resolve(
    requestHandler({
      url: opts.url,
      method: opts.method ?? "GET",
      data: opts.data,
    })
  );
};
