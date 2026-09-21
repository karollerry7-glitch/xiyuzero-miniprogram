// 通用静态内容页 — 隐私政策 / 用户协议 / 关于（?type=privacy|terms|about）
import Taro, { getCurrentInstance } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import "./index.scss";

interface Section {
  h: string;
  paras: string[];
}

interface LegalDoc {
  title: string;
  intro: string;
  sections: Section[];
  footer?: string;
}

const DOCS: Record<string, LegalDoc> = {
  privacy: {
    title: "隐私政策",
    intro:
      "西语Zero 非常重视您的个人信息保护。本政策说明我们收集哪些信息、如何使用与保护它们。使用本小程序即表示您理解并同意本政策。",
    sections: [
      {
        h: "一、我们收集的信息",
        paras: [
          "1. 账号信息：您通过微信登录时，我们通过微信官方接口获取您的 OpenID 用于身份识别。OpenID 仅用于派生本服务内的用户标识，我们不会存储您的微信密码。",
          "2. 学习记录：为提供学习进度同步、错词本、学习统计等功能，我们会在云端保存您的学习进度（已学词条、复习排程、每日学习量）。",
          "3. 设备信息：我们仅在小程序运行必需的范围内处理基础技术信息（如网络状态），不收集您的通讯录、相册、位置等与学习无关的信息。",
        ],
      },
      {
        h: "二、信息的使用",
        paras: [
          "1. 学习记录仅用于：恢复您的学习进度、安排复习计划、生成学习统计。",
          "2. 我们不会将您的个人信息出售或提供给任何第三方（不含依法必须配合的情形）。",
          "3. 我们不会基于您的个人信息进行用户画像或个性化广告推送。",
        ],
      },
      {
        h: "三、信息的存储与保护",
        paras: [
          "1. 学习数据存储于云端加密存储服务中，仅您本人登录后可访问。",
          "2. 我们采取业界通行的安全措施保护您的数据，包括传输加密（HTTPS）与访问鉴权。",
        ],
      },
      {
        h: "四、您的权利",
        paras: [
          "1. 您可以随时在本小程序内查看您的学习数据。",
          "2. 如需注销账号并删除全部数据，请通过「关于」页中的联系方式与我们联系，我们将在 15 个工作日内处理完毕。",
        ],
      },
      {
        h: "五、未成年人保护",
        paras: [
          "本产品为语言学习工具，面向一般用户。未成年人使用时应在监护人指导下进行，我们不会主动收集未成年人的个人信息。",
        ],
      },
      {
        h: "六、政策更新",
        paras: [
          "本政策如有重大变更，我们将在小程序内显著位置提醒。若您继续使用，视为接受更新后的政策。",
        ],
      },
    ],
  },
  terms: {
    title: "用户协议",
    intro:
      "欢迎使用西语Zero。本协议是您与西语Zero之间关于使用本小程序服务所订立的契约，请在使用前仔细阅读。",
    sections: [
      {
        h: "一、服务说明",
        paras: [
          "1. 西语Zero 是一款西班牙语词汇学习工具，提供基于 5D 学习法的单词学习、间隔复习、学习统计等功能。",
          "2. 词库内容由西语Zero 整理制作，仅供参考学习使用，不构成任何专业建议。",
        ],
      },
      {
        h: "二、账号与登录",
        paras: [
          "1. 本小程序通过微信授权登录，您无需另行注册账号。",
          "2. 您应妥善保管自己的微信账号，因账号保管不善导致的损失由您自行承担。",
        ],
      },
      {
        h: "三、会员服务与购买",
        paras: [
          "1. 免费用户可享受基础学习功能（每日新词数量与词库范围以产品内展示为准）。",
          "2. 会员服务为虚拟商品，购买后不支持无理由退货，但未消耗且在退款政策允许范围内的情形除外。",
          "3. 会员有效期以产品内展示为准，到期后权益自动恢复为免费版本，学习数据不受影响。",
        ],
      },
      {
        h: "四、用户行为规范",
        paras: [
          "1. 您不得通过技术手段绕过产品限制（如自动刷量、破解额度）、干扰服务正常运行或危害数据安全。",
          "2. 您不得对词库内容进行未经授权的复制、传播或商用。",
        ],
      },
      {
        h: "五、知识产权",
        paras: [
          "本小程序的词库内容、界面设计、程序代码及相关知识产权均归西语Zero 所有，未经书面许可不得转载或用于商业用途。",
        ],
      },
      {
        h: "六、免责声明",
        paras: [
          "1. 因不可抗力、网络故障、系统维护等原因导致服务中断的，我们将尽力恢复但不承担由此造成的间接损失。",
          "2. 学习效果因人而异，产品中的统计与预测仅作参考。",
        ],
      },
      {
        h: "七、协议变更",
        paras: [
          "我们可能不时更新本协议，重大变更将在小程序内提示。若您不同意更新后的协议，应停止使用本服务。",
        ],
      },
    ],
  },
  about: {
    title: "关于西语Zero",
    intro:
      "西语Zero 是一款面向中文母语者的西班牙语主动词汇学习工具，覆盖 Starter 到 B2 共 4505 个高频词条。",
    sections: [
      {
        h: "5D 学习法",
        paras: [
          "每个词条从五个维度学习：含义（最常用中文意思）、发音（音节与重音）、语法（阴阳性与搭配规则）、词块（高频搭配）、例句（真实语境）。先学后测，答对三次才算掌握。",
        ],
      },
      {
        h: "间隔复习（SRS）",
        paras: [
          "根据你对每个词的记忆表现自动排程：记得牢的间隔拉长，常错的更早复习，把时间花在最需要的地方。",
        ],
      },
      {
        h: "数据同步",
        paras: [
          "学习进度云端同步，换设备登录后进度自动恢复。收藏与部分本地设置保存在设备上。",
        ],
      },
      {
        h: "版本",
        paras: ["v1.0.0"],
      },
      {
        h: "官网与反馈",
        paras: [
          "官网：learn.xiyuzero.com",
          "问题反馈与数据删除申请，请通过官网与我们联系。",
        ],
      },
    ],
    footer: "Made with ♥ for Spanish learners",
  },
};

export default function LegalPage() {
  const [type, setType] = useState<string>("about");
  useEffect(() => {
    const params =
      getCurrentInstance().router?.params as Record<string, string> | undefined;
    const t = params?.type;
    if (t && DOCS[t]) setType(t);
    Taro.setNavigationBarTitle({ title: DOCS[t && DOCS[t] ? t : "about"].title });
  }, []);

  const doc = DOCS[type] ?? DOCS.about;

  return (
    <View className="legal">
      <Text className="legal__title">{doc.title}</Text>
      <Text className="legal__intro">{doc.intro}</Text>
      {doc.sections.map((s) => (
        <View key={s.h} className="legal__sec">
          <Text className="legal__h">{s.h}</Text>
          {s.paras.map((p, i) => (
            <Text key={i} className="legal__p">
              {p}
            </Text>
          ))}
        </View>
      ))}
      {doc.footer && <Text className="legal__footer">{doc.footer}</Text>}
    </View>
  );
}
