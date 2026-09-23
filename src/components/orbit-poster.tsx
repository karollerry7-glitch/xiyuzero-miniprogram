// 今日词轨海报 — Canvas 2D 绘制可分享打卡图
// 内容：日期 / 星轨主视觉（N 词） / 连续天数与本周累计 / 记忆句 / 西语ZERO 品牌标识
// 不含任何用户敏感信息（无昵称、无头像、无 OpenID）。
import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { Canvas, View, Text, Button } from "@tarojs/components";
import {
  ORBIT_RING_FRACS,
  ORBIT_RING_LABELS,
  orbitStars,
  palabrasLabel,
  seededRand,
} from "../shared/orbit";
import { quoteForDate } from "../shared/quotes";
import type { OrbitWord } from "../utils/storage";
import "./orbit-poster.scss";

const NIGHT = "#0B1736";
const GOLD = "#F2C46D";
const IVORY = "#FFF9EF";

/** 画布逻辑尺寸（px，绘制缓冲区） */
const W = 750;
const H = 1200;

export interface PosterData {
  words: OrbitWord[];
  count: number; // 今日总词数
  streak: number;
  week: number;
  /** 用户昵称（null = 未设置 → 海报署名「一位西语学习者」） */
  nickname: string | null;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function drawPoster(
  ctx: CanvasRenderingContext2D,
  d: PosterData,
  anonymous = false
): void {
  const total = d.words.length || d.count;
  // 署名：默认昵称；匿名或未设置 → 一位西语学习者（不含头像/其他账户信息）
  const signer = anonymous || !d.nickname ? "一位西语学习者" : d.nickname;

  // ---- 夜空底色 ----
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, H);

  // ---- 细腻颗粒（确定性） ----
  const rnd = seededRand(7);
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = `rgba(255,249,239,${(0.015 + rnd() * 0.03).toFixed(3)})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1, 1);
  }
  // ---- 背景星尘 ----
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 0.6 + rnd() * 1.4;
    ctx.globalAlpha = 0.15 + rnd() * 0.35;
    ctx.fillStyle = IVORY;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ---- 中央暖光 ----
  const cx = 375;
  const cy = 520;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 340);
  g.addColorStop(0, "rgba(242,196,109,0.10)");
  g.addColorStop(0.5, "rgba(232,111,81,0.04)");
  g.addColorStop(1, "rgba(232,111,81,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // ---- 日期 ----
  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(
    now.getDate()
  ).padStart(2, "0")} ${WEEKDAYS[now.getDay()]}`;
  ctx.fillStyle = "rgba(255,249,239,0.55)";
  ctx.font = "26px sans-serif";
  ctx.fillText(dateStr, cx, 120);

  // ---- 专属署名（昵称，仅昵称不带头像） ----
  ctx.fillStyle = "rgba(255,249,239,0.45)";
  ctx.font = "22px sans-serif";
  ctx.fillText(`${signer} 的今日词轨`, cx, 156);

  // ---- 五层轨道 ----
  const R = 245;
  ctx.strokeStyle = "rgba(255,249,239,0.10)";
  ctx.lineWidth = 1;
  for (const f of ORBIT_RING_FRACS) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.font = "17px sans-serif";
  ctx.fillStyle = "rgba(255,249,239,0.30)";
  ORBIT_RING_FRACS.forEach((f, i) => {
    ctx.fillText(ORBIT_RING_LABELS[i], cx, cy - R * f + 6);
  });

  // ---- 词星 ----
  const stars = orbitStars(d.words.length);
  ctx.font = "23px sans-serif";
  stars.forEach((p, i) => {
    const w = d.words[i];
    if (!w) return;
    const x = cx + Math.cos(p.angleRad) * R * p.radiusFrac;
    const y = cy + Math.sin(p.angleRad) * R * p.radiusFrac;
    ctx.save();
    ctx.shadowColor = "rgba(242,196,109,0.9)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,249,239,0.88)";
    ctx.fillText(w.spanish, x, y + 34);
  });

  // ---- 中央核心 ----
  ctx.fillStyle = GOLD;
  ctx.font = "104px Georgia, serif";
  ctx.fillText(String(d.count), cx, cy + 28);
  ctx.fillStyle = IVORY;
  ctx.font = "22px sans-serif";
  ctx.fillText(palabrasLabel(total).split("").join(" "), cx, cy + 70);
  ctx.fillStyle = "rgba(255,249,239,0.55)";
  ctx.font = "20px sans-serif";
  ctx.fillText("今日学习完成", cx, cy + 106);

  // ---- 文案 ----
  ctx.fillStyle = "rgba(242,196,109,0.95)";
  ctx.font = "italic 27px Georgia, serif";
  ctx.fillText(
    `Hoy estás ${total} ${total === 1 ? "palabra" : "palabras"} más cerca.`,
    cx,
    832
  );
  ctx.fillStyle = "rgba(255,249,239,0.6)";
  ctx.font = "21px sans-serif";
  ctx.fillText(`今天，你又离西班牙语更近了${total}个单词`, cx, 870);

  // ---- 统计 ----
  ctx.fillStyle = "rgba(255,249,239,0.85)";
  ctx.font = "23px sans-serif";
  ctx.fillText(`连续学习 ${d.streak} 天 · 本周累计 ${d.week} 词`, cx, 932);

  // ---- 记忆句 ----
  const q = quoteForDate();
  ctx.fillStyle = "rgba(232,111,81,0.92)";
  ctx.font = "italic 25px Georgia, serif";
  ctx.fillText(q.es, cx, 992);
  ctx.fillStyle = "rgba(255,249,239,0.55)";
  ctx.font = "20px sans-serif";
  ctx.fillText(q.zh, cx, 1026);

  // ---- 品牌（组合署名，同一基线：沃天岚 · 西语ZERO） ----
  const brandMain = "沃天岚";
  const brandSep = " · ";
  const brandSub = "西语ZERO";
  const brandY = 1118;
  ctx.font = "600 34px sans-serif";
  const wMain = ctx.measureText(brandMain).width;
  ctx.font = "24px sans-serif";
  const wSep = ctx.measureText(brandSep).width;
  const wSub = ctx.measureText(brandSub).width;
  let bx = cx - (wMain + wSep + wSub) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = IVORY;
  ctx.font = "600 34px sans-serif";
  ctx.fillText(brandMain, bx, brandY);
  bx += wMain;
  ctx.fillStyle = "rgba(242,196,109,0.6)";
  ctx.font = "24px sans-serif";
  ctx.fillText(brandSep, bx, brandY);
  bx += wSep;
  ctx.fillStyle = "rgba(255,249,239,0.5)";
  ctx.font = "24px sans-serif";
  ctx.fillText(brandSub, bx, brandY);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,249,239,0.4)";
  ctx.font = "18px sans-serif";
  ctx.fillText("每 天 认 识 一 点 新 的 世 界", cx, 1152);
}

export function OrbitPoster({
  data,
  onClose,
}: {
  data: PosterData;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [anonymous, setAnonymous] = useState(false);

  /** （重）绘制海报 — 绘制完成后置 ready；匿名切换时也重绘 */
  const render = () => {
    const q = Taro.createSelectorQuery();
    q.select("#orbitPoster").fields({ node: true });
    q.exec((res) => {
      const node = (res?.[0] as { node?: any })?.node;
      if (!node) return;
      node.width = W;
      node.height = H;
      drawPoster(
        node.getContext("2d") as CanvasRenderingContext2D,
        data,
        anonymous
      );
      setReady(true);
    });
  };

  // 挂载后等一帧再取 canvas 节点并绘制
  useEffect(() => {
    setReady(false);
    const timer = setTimeout(render, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anonymous]);

  /** 导出临时文件路径（预览/保存共用） */
  const exportFile = (cb: (path: string) => void) => {
    const q = Taro.createSelectorQuery();
    q.select("#orbitPoster").fields({ node: true });
    q.exec((res) => {
      const node = (res?.[0] as { node?: any })?.node;
      if (!node) {
        Taro.showToast({ title: "生成失败，请重试", icon: "none" });
        return;
      }
      Taro.canvasToTempFilePath({
        canvas: node,
        fileType: "png",
        success: (r) => cb(r.tempFilePath),
        fail: () => {
          Taro.showToast({ title: "生成失败，请重试", icon: "none" });
        },
      });
    });
  };

  /** 预览（长按可转发/收藏 — 微信分享图片的自然路径） */
  const preview = () => {
    exportFile((path) => {
      Taro.previewImage({ urls: [path] });
    });
  };

  /** 保存到相册（含授权处理） */
  const save = () => {
    if (saving) return;
    setSaving(true);
    exportFile((path) => {
      Taro.saveImageToPhotosAlbum({
        filePath: path,
        success: () => {
          setSaving(false);
          Taro.showToast({ title: "已保存到相册", icon: "success" });
        },
        fail: (e) => {
          setSaving(false);
          const msg = String(e?.errMsg || "");
          if (msg.includes("auth") || msg.includes("deny")) {
            Taro.showModal({
              title: "需要相册权限",
              content: "请在设置中允许「保存到相册」",
              confirmText: "去设置",
              success: (m) => {
                if (m.confirm) Taro.openSetting();
              },
            });
          } else {
            Taro.showToast({ title: "保存失败，请重试", icon: "none" });
          }
        },
      });
    });
  };

  return (
    <View className="poster-mask" onClick={onClose} catchMove>
      <View className="poster" onClick={(e) => e.stopPropagation()}>
        <Text className="poster__title">今日词轨</Text>
        <Canvas type="2d" id="orbitPoster" className="poster__canvas" />
        {!ready && <Text className="poster__loading">正在绘制星轨…</Text>}
        <View
          className="poster__anon"
          onClick={() => setAnonymous((v) => !v)}
        >
          <Text className="poster__anon-check">
            {anonymous ? "☑" : "☐"}
          </Text>
          <Text className="poster__anon-label">匿名分享（署名「一位西语学习者」）</Text>
        </View>
        <View className="poster__actions">
          <Button className="poster__btn" onClick={save}>
            {saving ? "保存中…" : "保存到相册"}
          </Button>
          <Button className="poster__btn poster__btn--ghost" onClick={preview}>
            预览 · 长按分享
          </Button>
        </View>
        <Text className="poster__close" onClick={onClose}>
          关闭
        </Text>
      </View>
    </View>
  );
}
