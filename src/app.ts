import { PropsWithChildren } from "react";
import { useLaunch } from "@tarojs/taro";
import { getToken } from "./utils/storage";
import { syncNow } from "./services/sync";
import "./app.scss";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 合规整改：不再对首次进入的用户自动登录（不调用 wx.login 建立账号）。
    // 仅当本地已存在登录凭证（用户此前主动登录过）时，静默同步云端进度。
    // 新用户默认进入游客体验模式，登录入口由用户在页面内主动点击。
    if (getToken()) {
      syncNow().catch(() => {
        /* 离线/未配置后端时静默，页面层有重试入口 */
      });
    }
  });
  return children;
}

export default App;
