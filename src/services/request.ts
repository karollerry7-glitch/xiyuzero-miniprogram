// 网络层 — 所有后端请求的唯一出口
// BASE_URL 说明（审计报告 R3）：
//   - xiyuzero.com 目前无 ICP 备案，小程序正式包不能直连未备案域名
//   - 开发期：微信开发者工具勾选「不校验合法域名」即可使用线上/本地 API
//   - 上线前二选一：① 域名备案后指向 Vercel ② API 部署到微信云托管（默认域名免备案）
// API 代码为标准 Request/Response，两处部署通用
//
// 云托管通道（方案②）：.env 设置 TARO_APP_USE_CLOUDBASE=1 后，
// /api/* 自动改走 Taro.cloud.callContainer（免域名备案、免合法域名校验）。
// 需同时设置 TARO_APP_CLOUDBASE_ENV（云托管环境 ID）与
// TARO_APP_CLOUDBASE_SERVICE（服务名，默认 xiyuzero-api）。默认关闭，不影响现状。

import Taro from "@tarojs/taro";
import { getToken } from "../utils/storage";

// 编译期内联：TARO_APP_ 前缀环境变量
const BASE_URL =
  process.env.TARO_APP_API_BASE || "https://learn.xiyuzero.com";

const USE_CLOUDBASE = process.env.TARO_APP_USE_CLOUDBASE === "1";
const CLOUDBASE_ENV = process.env.TARO_APP_CLOUDBASE_ENV || "";
const CLOUDBASE_SERVICE = process.env.TARO_APP_CLOUDBASE_SERVICE || "";


export class ApiError extends Error {
  status: number;
  offline: boolean;

  constructor(message: string, status: number, offline = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.offline = offline;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
  /** 401 时是否自动重登一次（默认 true，防循环） */
  retryOn401?: boolean;
}

function buildQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** 统一响应形状（两个通道共用） */
interface UnifiedResponse {
  statusCode: number;
  data: unknown;
}

/** 云托管通道：callContainer（返回形状与 wx.request 对齐） */
let cloudInited = false;

function ensureCloudInit(): void {
  if (cloudInited) return;
  const cloud = Taro.cloud;
  if (CLOUDBASE_ENV) {
    cloud.init({ env: CLOUDBASE_ENV });
  } else {
    cloud.init();
  }
  cloudInited = true;
}

function callContainerRequest(
  path: string,
  method: NonNullable<RequestOptions["method"]>,
  data: Record<string, unknown> | undefined,
  header: Record<string, string>
): Promise<UnifiedResponse> {
  ensureCloudInit();
  const cloud = Taro.cloud as unknown as {
    callContainer: (opts: Record<string, unknown>) => Promise<{
      statusCode?: number;
      data?: unknown;
    }>;
  };
  // X-WX-SERVICE：网关据此路由到具体服务，缺失会返回 INVALID_PATH 404
  const cbHeader: Record<string, string> = {
    ...header,
    "X-WX-SERVICE": CLOUDBASE_SERVICE,
  };
  return cloud
    .callContainer({
      config: CLOUDBASE_ENV ? { env: CLOUDBASE_ENV } : undefined,
      path,
      method,
      data,
      header: cbHeader,
    })
    .then((res) => ({
      statusCode: res.statusCode ?? 0,
      data: res.data,
    }));
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", data, query, retryOn401 = true } = options;
  const token = getToken();
  const header: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) header.Authorization = `Bearer ${token}`;

  const fullPath = `${path}${buildQuery(query)}`;
  const useCb = USE_CLOUDBASE && CLOUDBASE_SERVICE && path.startsWith("/api");

  let res: UnifiedResponse;
  try {
    if (useCb) {
      res = await callContainerRequest(
        fullPath,
        method,
        data as Record<string, unknown> | undefined,
        header
      );
    } else {
      res = await Taro.request({
        url: `${BASE_URL}${fullPath}`,
        method,
        data,
        header,
        timeout: 10000,
      });
    }
  } catch {
    // 网络层失败（断网/域名不可达）
    throw new ApiError("网络不可用，请检查网络后重试", 0, true);
  }

  if (res.statusCode === 401 && retryOn401) {
    // token 过期：清空后重登一次
    const { ensureLogin } = await import("./auth");
    try {
      await ensureLogin(true);
      return request<T>(path, { ...options, retryOn401: false });
    } catch {
      throw new ApiError("登录已过期，请重新打开小程序", 401);
    }
  }

  if (res.statusCode >= 400) {
    const msg =
      (res.data as { error?: string })?.error ??
      `请求失败（${res.statusCode}）`;
    throw new ApiError(msg, res.statusCode);
  }

  return res.data as T;
}
