// 分享工具 — 全页面统一转发/朋友圈配置
// 注意：useShareAppMessage / useShareTimeline 必须在每个页面文件内直接调用
//（Taro 的 taro-loader 靠静态扫描页面源码注入 enableShareAppMessage/enableShareTimeline 标志，
//  包一层自定义 hook 会导致扫描不到、右上角菜单不出现），这里只放公共常量与菜单开启逻辑。
import Taro from "@tarojs/taro";

export const SHARE_TITLE = "沃天澜·西语｜5D 五步法学西语，记得住才是真的会";
export const SHARE_PATH = "/pages/learn/index";

/** 显式开启右上角菜单的「转发给朋友」与「分享到朋友圈」入口。
 *  页面定义了对应钩子时入口本应自动出现，但部分基础库版本需此调用兜底；
 *  朋友圈入口仅在「企业主体+已认证」小程序上生效，个人主体由平台隐藏，调用无副作用。 */
export function ensureShareMenu(): void {
  // menus 参数（开启朋友圈入口）在当前 Taro 类型定义中缺失，但运行时基础库支持，故放宽类型
  const opt = {
    withShareTicket: false,
    menus: ["shareAppMessage", "shareTimeline"],
  } as unknown as Parameters<typeof Taro.showShareMenu>[0];
  Taro.showShareMenu(opt).catch(() => {
    /* 不支持 menus 的旧基础库：忽略，仅开启转发 */
  });
}
