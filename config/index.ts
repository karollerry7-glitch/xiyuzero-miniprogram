import { defineConfig, type UserConfigExport } from "@tarojs/cli";
import devConfig from "./dev";
import prodConfig from "./prod";

export default defineConfig(async (merge) => {
  const baseConfig: UserConfigExport<"webpack5"> = {
    projectName: "xiyuzero-miniprogram",
    date: "2026-9-18",
    designWidth: 750,
    deviceRatio: { 640: 2.34 / 2, 750: 1, 375: 2, 828: 1.81 / 2 },
    sourceRoot: "src",
    outputRoot: "dist",
    plugins: [],
    framework: "react",
    compiler: "webpack5",
    mini: {
      postcss: {
        pxtransform: { enable: true, config: {} },
        cssModules: { enable: false },
      },
      miniCssExtractPluginOption: { ignoreOrder: true },
    },
    h5: {},
  };

  if (process.env.NODE_ENV === "development") {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
