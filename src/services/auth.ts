// 微信登录服务
// 流程（审计报告 §12）：
//   wx.login → code → POST /api/auth/wechat → 服务端 code2Session →
//   openid 关联 wechat_accounts → 统一 users → JWT
// openid 永远不是业务 user_id。

import Taro from "@tarojs/taro";
import { useCallback, useEffect, useState } from "react";
import { ServerUser } from "../shared/types";
import { request } from "./request";
import {
  clearToken,
  getToken,
  getTokenExp,
  getUser,
  setToken,
  setUser,
} from "../utils/storage";

interface AuthResponse {
  token: string;
  expiresIn: number;
  user: ServerUser;
}

function tokenValid(): boolean {
  const t = getToken();
  // 提前 5 分钟视为过期
  return !!t && getTokenExp() - Date.now() > 5 * 60 * 1000;
}

/**
 * 确保已登录（静默）。
 * @param force 忽略本地有效 token，强制重新登录（401 重试用）
 */
export async function ensureLogin(force = false): Promise<ServerUser> {
  if (!force && tokenValid()) {
    const cached = getUser();
    if (cached) return cached;
  }

  const { code } = await Taro.login();
  const res = await request<AuthResponse>("/api/auth/wechat", {
    method: "POST",
    data: { code },
    retryOn401: false,
  });

  setToken(res.token, res.expiresIn);
  setUser(res.user);
  return res.user;
}

export function logout(): void {
  clearToken();
}

/** 设置昵称（登录后引导第二步；PATCH /api/profile） */
export async function updateNickname(
  nickname: string
): Promise<ServerUser> {
  const res = await request<{ user: ServerUser }>("/api/profile", {
    method: "PATCH",
    data: { nickname },
  });
  setUser(res.user);
  return res.user;
}

/** 页面级登录 Hook：挂载时静默登录，暴露用户/加载/错误/重试 */
export function useAuth() {
  const [user, setUserState] = useState<ServerUser | null>(() => getUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const u = await ensureLogin();
      setUserState(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }, []);

  /** 轻量刷新：从登录页返回等场景同步本地缓存（不闪 loading、不发请求） */
  const refresh = useCallback(() => {
    setUserState(getUser());
  }, []);

  useEffect(() => {
    if (!user) login();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, loading, error, login, refresh };
}
