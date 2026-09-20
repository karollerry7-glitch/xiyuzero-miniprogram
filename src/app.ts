import { PropsWithChildren } from "react";
import { useLaunch } from "@tarojs/taro";
import { ensureLogin } from "./services/auth";
import { syncNow } from "./services/sync";
import "./app.scss";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 静默微信登录：失败不阻塞启动，进入页面后按需重试
    ensureLogin()
      .then(() => {
        // 登录成功后同步云端进度（换设备恢复 / 多端同步；离线静默）
        return syncNow();
      })
      .catch(() => {
        /* 离线/未配置后端时静默，页面层有重试入口 */
      });
  });
  return children;
}

export default App;
