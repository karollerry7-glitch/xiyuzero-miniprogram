import type { UserConfigExport } from "@tarojs/cli";

export default {
  mini: {},
  h5: {
    /**
     * Web 端静态资源路由与 learn.xiyuzero.com 保持独立；
     * 本项目当前仅面向微信小程序，h5 构建暂不启用。
     */
  },
} satisfies UserConfigExport<"webpack5">;
