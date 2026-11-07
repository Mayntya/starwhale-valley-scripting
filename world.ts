/**
 * world.ts — 像素场景
 *
 * 世界坐标固定 80 × 170，绘制时用 max(w/80, h/170) 的整数级缩放铺满，
 * 所有图形只有 fillRect，没有抗锯齿，所以天生是「像素」的。
 * 动画时间按 1/12 秒量化：像素画本来就该一顿一顿的。
 */

import type { CanvasRenderingContext } from "scripting"
import { Script } from "scripting"
import {
  celestialAt,
  gradePalette,
  mix,
  paletteAt,
  rgba,
  type Palette,
  type WeatherKind,
} from "./theme"
import { applySeason, SEASON_FIREFLY, SEASON_METEOR, type Season } from "./season"
import { player, pulse, react, updatePlayer, type SpotId } from "./player"

export const VW = 80
export const VH = 170
const HORIZON = 100

type Size = { width: number; height: number }

/* ------------------------------------------------------------------ */
/* 画笔                                                                */
/* ------------------------------------------------------------------ */

class Brush {
  ctx: CanvasRenderingContext
  w: number
  h: number
  s: number
  ox: number
  oy: number

  constructor(ctx: CanvasRenderingContext, size: Size) {
    this.ctx = ctx
    this.w = size.width
    this.h = size.height
    this.s = Math.max(size.width / VW, size.height / VH)
    this.ox = (size.width - VW * this.s) / 2
    this.oy = (size.height - VH * this.s) / 2
  }

  /** 虚拟单位矩形；边缘四舍五入，相邻块之间不会漏缝 */
  r(x: number, y: number, w: number, h: number, color: string, alpha = 1) {
    const x0 = Math.round(this.ox + x * this.s)
    const y0 = Math.round(this.oy + y * this.s)
    const x1 = Math.round(this.ox + (x + w) * this.s)
    const y1 = Math.round(this.oy + (y + h) * this.s)
    if (x1 <= x0 || y1 <= y0) return
    if (alpha < 1) {
      if (alpha <= 0) return
      this.ctx.globalAlpha = alpha
      this.ctx.fillStyle = color
      this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
      this.ctx.globalAlpha = 1
    } else {
      this.ctx.fillStyle = color
      this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    }
  }

  /** 整屏铺色（用于夜空兜底、闪电、雾） */
  cover(color: string, alpha = 1) {
    if (alpha <= 0) return
    this.ctx.globalAlpha = alpha
    this.ctx.fillStyle = color
    this.ctx.fillRect(0, 0, this.w, this.h)
    this.ctx.globalAlpha = 1
  }

  /** 像素直线：拆成一段段小方块 */
  line(x1: number, y1: number, x2: number, y2: number, thick: number, color: string, alpha = 1) {
    const steps = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) * 2))
    for (let i = 0; i < steps; i++) {
      const k = i / steps
      this.r(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, thick, thick, color, alpha)
    }
  }
}

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return s - Math.floor(s)
}

/**
 * 固定的点缀色（麦穗、南瓜、花、稻草人）自己不会入夜，
 * 得手动往夜色里涗一下，否则半夜亮得像霓虹灯。
 * keep 越大就越“自发光”。
 */
function acc(pal: Palette, color: string, keep = 0.26): string {
  if (pal.dark < 0.04) return color
  const dark = mix(pal.grass, "#0a1016", 0.72)
  return mix(color, dark, Math.min(1, pal.dark) * (1 - keep))
}

/** 椭圆按行切成方块，得到锯齿边 */
function oval(
  b: Brush,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  alpha = 1
) {
  const rows = Math.max(2, Math.round(ry * 2))
  const rh = (ry * 2) / rows
  for (let i = 0; i < rows; i++) {
    const dy = ((i + 0.5) / rows) * 2 - 1
    const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy))
    if (half <= 0.05) continue
    b.r(cx - half, cy - ry + i * rh, half * 2, rh + 0.04, color, alpha)
  }
}

/** 天空渐变的第 f 段颜色（0..1） */
function skyAt(sky: string[], f: number): string {
  const x = Math.min(0.9999, Math.max(0, f)) * (sky.length - 1)
  const i = Math.floor(x)
  const a = sky[i]
  const c = sky[i + 1] ?? a
  return mix(a, c, x - i)
}

/* ------------------------------------------------------------------ */
/* 天空 / 天体 / 云 / 山                                               */
/* ------------------------------------------------------------------ */

function drawSky(b: Brush, pal: Palette) {
  const bands = 26
  const step = (HORIZON + 6) / bands
  for (let i = 0; i < bands; i++) {
    const f = i / (bands - 1)
    b.r(-14, -2 + i * step, 108, step + 0.5, skyAt(pal.sky, f))
  }
}

function drawStars(b: Brush, pal: Palette, t: number, season: Season) {
  if (pal.stars < 0.04) return
  const boost = season === "winter" ? 1.15 : season === "summer" ? 0.88 : 1
  for (let i = 0; i < 52; i++) {
    const x = -14 + hash(i * 3.17) * 108
    const y = 2 + hash(i * 7.71) * 74
    const fade = 1 - y / 92
    const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.7 + i * 1.31))
    const big = hash(i * 5.37) > 0.84
    const a = Math.min(1, pal.stars * tw * fade * boost)
    b.r(x, y, big ? 0.95 : 0.55, big ? 0.95 : 0.55, "#eef4ff", a)
  }
  // 流星：冬天最勤，夏天难得一见
  const m = SEASON_METEOR[season]
  const period = 11 / m
  const k = Math.floor(t / period)
  const local = t - k * period
  if (pal.stars > 0.5 && hash(k * 4.7) > 0.68 - m * 0.22 && local < 0.6) {
    const x0 = 12 + hash(k * 2.1) * 46
    const y0 = 8 + hash(k * 3.9) * 26
    for (let i = 0; i < 8; i++) {
      const kk = i / 8
      b.r(x0 - kk * 9, y0 + kk * 5.4, 1.15, 0.85, "#ffffff", (1 - kk) * (1 - local / 0.6) * 0.9)
    }
  }
}

function drawCelestial(b: Brush, pal: Palette, hour: number, hidden: boolean) {
  const c = celestialAt(hour)
  if (hidden) {
    // 阴雨天太阳/月亮被云挡掉，只留一层很淡的光
    oval(b, c.x, c.y, c.radius + 3, c.radius + 2.6, pal.sunGlow, 0.05)
    return
  }
  for (let i = 3; i >= 1; i--) {
    oval(b, c.x, c.y, c.radius + i * 2.8, c.radius + i * 2.3, pal.sunGlow, 0.08)
  }
  oval(b, c.x, c.y, c.radius, c.radius, pal.sun)
  if (c.isSun) {
    oval(b, c.x, c.y, c.radius * 0.55, c.radius * 0.55, "#ffffff", 0.28)
  } else {
    oval(b, c.x - 1.6, c.y - 1.4, 1.3, 1.1, rgba("#8d99b6", 0.55))
    oval(b, c.x + 0.9, c.y + 0.7, 1.7, 1.3, rgba("#8d99b6", 0.45))
    oval(b, c.x - 0.4, c.y + 2.2, 1, 0.9, rgba("#8d99b6", 0.35))
  }
}

function cloud(b: Brush, x: number, y: number, k: number, pal: Palette, alpha: number) {
  b.r(x, y, 11 * k, 2.3 * k, pal.cloud, alpha)
  b.r(x + 2.1 * k, y - 2 * k, 5 * k, 2.3 * k, pal.cloud, alpha)
  b.r(x + 6.2 * k, y - 1.1 * k, 3.2 * k, 1.5 * k, pal.cloud, alpha)
  b.r(x + 4.1 * k, y - 3.2 * k, 1.8 * k, 1.4 * k, pal.cloud, alpha)
  b.r(x + 1.1 * k, y + 1.8 * k, 9 * k, 1.1 * k, pal.cloudShade, alpha * 0.85)
}

function drawOvercast(b: Brush, pal: Palette, t: number, kind: WeatherKind) {
  if (kind === "clear" || kind === "cloudy") return
  const heavy = kind === "storm" ? 1 : kind === "rain" ? 0.74 : kind === "snow" ? 0.36 : 0.44
  const toward = kind === "snow" ? "#8d9aa8" : kind === "fog" ? "#a5adb1" : "#39424f"
  const base = mix(pal.cloudShade, toward, 0.4 + heavy * 0.28)
  const edge = 11 + heavy * 15
  const lift = (x: number) =>
    Math.sin(x * 0.19 + t * 0.42) * 1.15 +
    Math.sin(x * 0.061 - t * 0.19) * 1.7 +
    hash(Math.floor(x * 0.7) * 1.73) * 0.6
  for (let x = -2; x < 84; x++) {
    b.r(x, -3, 1.05, edge + lift(x) + 3, base, 0.97)
  }
  // 顶亮一层、底深一层，避免成一条色条
  for (let x = -2; x < 84; x += 2) {
    b.r(x, -3, 2.1, 4 + hash(x * 0.9) * 3, mix(base, pal.cloud, 0.32), 0.45)
  }
  for (let x = -2; x < 84; x++) {
    const y = edge + lift(x) - 2
    b.r(x, y, 1.05, 2.2, mix(base, "#000000", 0.28), 0.35)
  }
  // 边缘化开，不要一刀切
  for (let x = -2; x < 84; x += 2) {
    b.r(x, edge + lift(x), 2.1, 1.6, base, 0.5)
    b.r(x, edge + lift(x) + 1.6, 2.1, 1.4, base, 0.26)
  }
}

function drawClouds(b: Brush, pal: Palette, t: number, kind: WeatherKind, hour: number) {
  const count = kind === "clear" ? 3 : kind === "fog" ? 6 : 7
  const c = celestialAt(hour)
  const tint =
    kind === "rain" || kind === "storm"
      ? "#6b7683"
      : kind === "snow"
        ? "#cfd9e2"
        : kind === "fog"
          ? "#c2cacd"
          : null
  const cp = tint
    ? {
        ...pal,
        cloud: mix(pal.cloud, tint, 0.62),
        cloudShade: mix(pal.cloudShade, tint, 0.5),
      }
    : pal
  for (let i = 0; i < count; i++) {
    const sp = 0.55 + hash(i * 2.21) * 1.3
    const k = 0.65 + hash(i * 4.43) * 0.85
    const y = 10 + hash(i * 9.13) * 46
    const x = ((hash(i * 6.77) * 128 + t * sp) % 128) - 26
    // 太阳/月亮附近让云让开，不然叠成一团发白的糊块
    if (Math.hypot(x + 5.5 * k - c.x, y + 1 - c.y) < 14) continue
    cloud(b, x, y, k, cp, kind === "clear" ? 0.9 : 0.95)
  }
}

function drawRidge(b: Brush, baseY: number, height: number, seed: number, color: string) {
  for (let x = -14; x < 94; x += 1) {
    const n =
      Math.sin((x + seed) * 0.114) * 0.55 +
      Math.sin((x + seed * 2.7) * 0.061) * 0.3 +
      Math.sin((x + seed * 5.3) * 0.287) * 0.15
    const hh = height * (0.4 + 0.6 * (n * 0.5 + 0.5))
    b.r(x, baseY - hh, 1.06, hh + 12, color)
  }
}

function pine(b: Brush, x: number, baseY: number, h: number, color: string) {
  const rows = Math.max(4, Math.round(h))
  for (let i = 0; i < rows; i++) {
    const k = i / rows
    const half = h * 0.34 * k * (0.72 + 0.28 * Math.abs(Math.sin(k * Math.PI * 3)))
    b.r(x - half, baseY - h + i, Math.max(0.9, half * 2), 1.06, color)
  }
}

function drawTreeLine(b: Brush, pal: Palette, baseY: number) {
  const c = mix(pal.treeDark, pal.nearRidge, 0.4)
  for (let i = 0; i < 17; i++) {
    const x = -8 + i * 6.2 + hash(i * 3.71) * 2.4
    pine(b, x, baseY + 1.5, 6 + hash(i * 8.31) * 7, c)
  }
}

/* ------------------------------------------------------------------ */
/* 农舍 / 橡树 / 田 / 池塘 / 篱笆                                     */
/* ------------------------------------------------------------------ */

function pane(b: Brush, x: number, y: number, w: number, h: number, pal: Palette) {
  b.r(x, y, w, h, mix(pal.wallShade, "#22323e", 0.7))
  const lit = Math.max(0, Math.min(1, (pal.dark - 0.16) * 1.7))
  if (lit > 0.02) b.r(x + 0.4, y + 0.4, w - 0.8, h - 0.8, pal.window, lit)
  b.r(x + w / 2 - 0.25, y, 0.5, h, pal.wallShade, 0.9)
  b.r(x, y + h / 2 - 0.25, w, 0.5, pal.wallShade, 0.9)
  b.r(x - 0.6, y - 0.6, w + 1.2, 0.6, pal.wallShade)
  b.r(x - 0.6, y + h, w + 1.2, 0.6, pal.wallShade)
  b.r(x - 0.6, y, 0.6, h, pal.wallShade)
  b.r(x + w, y, 0.6, h, pal.wallShade)
  if (lit > 0.02) b.r(x - 1.2, y + h, w + 2.4, 0.7, pal.window, lit * 0.35)
}

function drawHouse(b: Brush, pal: Palette, t: number) {
  const apexX = 22
  const apexY = 106
  const eaveY = 120
  const halfW = 16
  const rows = eaveY - apexY

  // 屋顶：一行一行长出来的三角
  for (let i = 0; i < rows; i++) {
    const hw = ((i + 1) / rows) * halfW
    b.r(apexX - hw, apexY + i, hw * 2, 1.06, pal.roof)
    b.r(apexX + hw * 0.28, apexY + i, hw * 0.72, 1.06, pal.roofShade)
    if (i % 3 === 0) b.r(apexX - hw, apexY + i, hw * 2, 0.35, mix(pal.roofShade, "#000000", 0.2))
  }
  b.r(apexX - halfW - 1, eaveY, halfW * 2 + 2, 1.7, pal.roofShade)
  b.r(apexX - 1.2, apexY, 2.4, 1, mix(pal.roof, "#ffffff", 0.28))

  // 烟囱
  b.r(27.5, 103.4, 3, 8, pal.wallShade)
  b.r(27.1, 102.8, 3.8, 1.2, pal.roofShade)
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.22 + i * 0.34) % 1
    const yy = 101.5 - k * 13
    const xx = 29 + Math.sin(k * 5 + i) * 1.6 + k * 2.4
    oval(b, xx, yy, 0.8 + k * 1.8, 0.7 + k * 1.3, pal.cloud, 0.3 * (1 - k) * (0.35 + pal.dark * 0.65))
  }

  // 墙体
  b.r(10, eaveY, 24, 13, pal.wall)
  b.r(27.5, eaveY, 6.5, 13, pal.wallShade)
  b.r(10, 131.6, 24, 1.4, mix(pal.wallShade, "#000000", 0.18))
  // 木梁
  for (let x = 11; x < 34; x += 4.4) b.r(x, eaveY, 0.7, 13, mix(pal.wallShade, "#000000", 0.12), 0.7)

  pane(b, 12.5, 121.6, 5, 4.6, pal)
  pane(b, 26, 121.6, 5, 4.6, pal)

  // 门
  b.r(18.4, 123.2, 7.2, 0.9, pal.wallShade)
  b.r(19, 124, 6, 8, pal.roofShade)
  b.r(21.6, 124, 0.7, 8, mix(pal.roofShade, "#000000", 0.25))
  b.r(23.6, 128, 0.9, 0.9, "#e8c07a")
  // 台阶
  b.r(9, 132, 26, 1.6, pal.stone)
  b.r(9, 133.6, 26, 0.7, mix(pal.stone, "#000000", 0.35))
  // 窗台花
  b.r(12.8, 126.4, 4.6, 0.9, pal.roofShade)
  const fl = ["#f0a8c0", "#f2e6a0", "#e88a7a"]
  for (let i = 0; i < 3; i++) b.r(13.1 + i * 1.5, 125.5, 0.9, 0.9, fl[i], 0.9)
}

function drawOak(b: Brush, pal: Palette, t: number, season: Season, now: number) {
  // 平时只是慢慢摆；我推它一下的时候会整个树冠抖一抖
  const shake = pulse("tree", now)
  const sway = Math.round(
    (Math.sin(t * 0.55) * 0.6 + (shake > 0 ? Math.sin(t * 16) * 1.5 * shake : 0)) * 10
  ) / 10
  const cx = 68 + sway
  const bark = mix(pal.soilDark, "#2c1f18", 0.5)
  const barkLit = mix(pal.soilDark, "#6a5038", 0.34)
  // 树干：下宽上窄，摆一点缝
  for (let y = 108; y < 138; y++) {
    const k = (y - 108) / 30
    const w = 2.6 + k * 1.7
    b.r(cx - w / 2, y, w, 1.02, bark)
    b.r(cx - w / 2, y, 0.9, 1.02, barkLit, 0.75)
  }
  // 树根
  b.r(cx - 3.6, 136.2, 3.2, 1.4, bark)
  b.r(cx + 0.4, 136.2, 3.2, 1.4, bark)
  // 两根树枝向上伸进树冠
  b.r(cx - 3.6, 106.4, 4.2, 1, bark)
  b.r(cx - 4.6, 103, 1.2, 3.6, bark)
  b.r(cx + 0.2, 104.4, 4.4, 1, bark)
  b.r(cx + 3.4, 101.4, 1.2, 3.2, bark)
  // 树冠：先暗后亮，边缘不规整
  oval(b, cx - 4, 103, 15, 10, pal.treeMid)
  oval(b, cx + 8, 98, 8.5, 7.5, pal.treeMid)
  oval(b, cx - 14, 100, 6.5, 6, pal.treeMid)
  oval(b, cx + 2, 111, 10, 5, pal.treeDark, 0.75)
  oval(b, cx - 8, 99, 9, 6.5, pal.treeLit, 0.72)
  oval(b, cx - 10, 96, 5.5, 3.2, pal.treeLit, 0.45)
  oval(b, cx + 6, 96, 4, 2.6, pal.treeLit, 0.35)

  // 季节在身上留的记号
  if (season === "spring") {
    // 樱花：树冠上撒一层粉白小花
    for (let i = 0; i < 26; i++) {
      const a = hash(i * 2.17) * 6.283
      const rr = 2.5 + hash(i * 5.53) * 12
      const x = cx - 1 + Math.cos(a) * rr
      const y = 101 + Math.sin(a) * rr * 0.62
      const c = i % 3 === 0 ? "#ffd9e6" : i % 3 === 1 ? "#f7bcd2" : "#fff2f7"
      b.r(x, y, 0.75, 0.7, c, 0.92)
    }
  } else if (season === "autumn") {
    // 将落未落的黄叶
    for (let i = 0; i < 13; i++) {
      const a = hash(i * 3.71) * 6.283
      const rr = 3 + hash(i * 6.19) * 11
      const x = cx - 1 + Math.cos(a) * rr
      const y = 100 + Math.sin(a) * rr * 0.6
      b.r(x, y, 0.85, 0.75, i % 2 ? "#f0b848" : "#d8802a", 0.85)
    }
  } else if (season === "winter") {
    // 树冠上顶着几处积雪（不画裸枝，否则像天线）
    const cap = (x: number, y: number, w: number, a: number) => {
      b.r(x, y, w, 1.25, acc(pal, "#e8f1f8", 0.62), a)
      b.r(x + w * 0.16, y + 1.15, w * 0.64, 0.7, acc(pal, "#cfe0ec", 0.6), a * 0.8)
    }
    cap(cx - 6.5, 92, 7.6, 0.9)
    cap(cx + 4.8, 89.3, 6.2, 0.85)
    cap(cx - 17.2, 95.6, 5, 0.7)
    cap(cx + 12, 94, 4.4, 0.6)
  }

  // 摇树时落下来的叶子，颜色跟着季节
  if (shake > 0) {
    const leaf =
      season === "spring" ? "#ffd9e6" : season === "autumn" ? "#e0a03a" : season === "winter" ? "#e8f1f8" : "#8fbe62"
    for (let i = 0; i < 7; i++) {
      const pr = Math.min(1, (1 - shake) * 1.25 + i * 0.03)
      const x = cx - 7 + hash(i * 3.31) * 14 + Math.sin(pr * 9 + i) * 2.2
      const y = 96 + pr * 28 + hash(i * 5.13) * 4
      b.r(x, y, 0.95, 0.8, acc(pal, leaf, 0.3), 0.95 * (1 - pr * 0.55))
    }
  }
}

const FX = 38
const FY = 116
const FW = 24
const FH = 24

function drawField(b: Brush, pal: Palette, t: number, kind: WeatherKind, season: Season) {
  b.r(FX, FY, FW, FH, pal.soil)
  b.r(FX, FY, FW, 0.9, mix(pal.soil, "#000000", 0.22))
  b.r(FX, FY + FH - 0.9, FW, 0.9, pal.soilDark)
  const wheat = mix(pal.grassDark, "#a8681e", 0.62)
  for (let r0 = 0; r0 < 4; r0++) {
    const y = FY + 1.6 + r0 * 5.7
    b.r(FX + 0.8, y + 3.9, FW - 1.6, 0.8, pal.soilDark, 0.85)
    for (let i = 0; i < 6; i++) {
      const x = FX + 1.9 + i * 3.9
      const sw = Math.sin(t * 1.6 + i * 0.9 + r0 * 1.7) * 0.55
      if (season === "autumn") {
        // 金黄麦子：高一点的秆 + 沉下来的穗
        b.r(x + sw, y - 1.4, 0.65, 4.6, wheat)
        b.r(x - 0.7 + sw, y - 1.9, 1.9, 1.15, acc(pal, "#dfae42"))
        b.r(x - 0.4 + sw, y - 2.5, 1.3, 0.75, acc(pal, "#f0c85c", 0.32))
      } else if (season === "summer") {
        // 长势最疯的时候：叶子铺开，中间顶一朵小黄花
        b.r(x + sw, y - 0.7, 0.75, 3.8, pal.grassDark)
        b.r(x - 1.1 + sw, y + 0.2, 1.5, 1.05, pal.grassLit)
        b.r(x + 0.7 + sw, y + 1.1, 1.5, 1.05, pal.grass)
        b.r(x - 0.35 + sw, y - 1.5, 0.95, 0.95, acc(pal, "#f2d64e", 0.34))
      } else if (season === "winter") {
        // 收完的地：只剩短短的茬
        b.r(x + sw, y + 1.3, 0.65, 1.5, mix(pal.grassDark, "#c8c0a8", 0.4))
        b.r(x + 0.9 + sw, y + 1.7, 0.6, 1.1, mix(pal.grassDark, "#a89880", 0.3))
      } else {
        // 春天的嫩苗
        b.r(x + sw, y, 0.7, 2.7, pal.grassDark)
        b.r(x - 1 + sw, y + 0.5, 1.3, 0.9, pal.grassLit)
        b.r(x + 0.6 + sw, y + 1.3, 1.3, 0.9, pal.grass)
      }
      if (kind === "snow") b.r(x - 1.2 + sw, y - 0.6, 2.8, 0.8, "#f0f6fb", 0.8)
    }
  }
  if (season === "autumn") drawPumpkins(b, pal);
}

function drawPath(b: Brush, pal: Palette) {
  for (let y = 132; y < 172; y += 1) {
    const k = (y - 132) / 40
    const half = 1.7 + k * 4.6
    const cx = 22 - k * 4.5
    b.r(cx - half, y, half * 2, 1.06, pal.path)
  }
  for (let i = 0; i < 14; i++) {
    const k = hash(i * 4.9)
    const y = 134 + k * 34
    const kk = (y - 132) / 40
    const half = 1.7 + kk * 4.6
    const cx = 22 - kk * 4.5
    const x = cx - half + hash(i * 8.3) * half * 2
    b.r(x, y, 1.2 + hash(i * 3.1) * 1.4, 0.8, mix(pal.path, "#000000", 0.18), 0.7)
  }
}

function drawPond(b: Brush, pal: Palette, t: number, now: number) {
  const cx = POND.x
  const cy = POND.y
  const rx = POND.rx
  const ry = POND.ry
  oval(b, cx, cy + 0.6, rx + 1.2, ry + 1.2, mix(pal.grassDark, "#000000", 0.25))
  oval(b, cx, cy, rx, ry, pal.water)
  oval(b, cx - 3, cy - 2.4, rx * 0.6, ry * 0.48, mix(pal.water, pal.waterHi, 0.4), 0.45)
  for (let i = 0; i < 5; i++) {
    const k = (t * 0.28 + i * 0.26) % 1
    const w = 1.6 + k * 7
    const yy = cy - ry * 0.7 + ((i * 3.3) % (ry * 1.5))
    b.r(cx - w / 2 + Math.sin(t * 0.8 + i) * 1.4, yy, w, 0.5, pal.waterHi, 0.5 * (1 - k * 0.65))
  }
  // 荷叶
  oval(b, cx + 5.5, cy + 2, 2.3, 1.3, pal.grassDark, 0.92)
  oval(b, cx + 5.2, cy + 1.6, 1.2, 0.6, pal.grassLit, 0.6)
  // 芦苇
  for (let i = 0; i < 4; i++) {
    const x = cx - rx + 1.5 + i * 1.7
    const sw = Math.sin(t * 1.1 + i) * 0.5
    b.r(x + sw, cy - ry - 3.6, 0.6, 5.6, pal.grassDark)
    b.r(x + sw - 0.2, cy - ry - 4.4, 1, 1.2, mix(pal.grassDark, "#000000", 0.25))
  }
  // 蹲下去拨了一下水：一圈圈荡开（用碎点拼环，像素风不能画真椭圆描边）
  const k = pulse("pond", now)
  for (let ring = 0; ring < 2; ring++) {
    const kk = k - ring * 0.24
    if (kk <= 0) continue
    const rr = 1.8 + (1 - kk) * 10
    const c = mix(pal.waterHi, "#ffffff", 0.45)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.283
      const x = cx + Math.cos(a) * rr
      const y = cy + 0.4 + Math.sin(a) * rr * 0.44
      b.r(x - 0.55, y - 0.3, 1.15, 0.6, c, kk * 0.85)
    }
  }
}

function drawFence(b: Brush, pal: Palette) {
  const rail = mix(pal.path, pal.soilDark, 0.5)
  const segs: [number, number][] = [
    [-14, 15],
    [28, 94],
  ]
  for (const [x0, x1] of segs) {
    b.r(x0, 140.4, x1 - x0, 1.1, rail)
    b.r(x0, 143.1, x1 - x0, 1.1, mix(rail, "#000000", 0.15))
    for (let x = x0 + 0.4; x < x1 - 1; x += 5.6) {
      b.r(x, 139, 1.4, 6.2, mix(rail, "#000000", 0.2))
      b.r(x, 138.2, 1.4, 1.1, mix(rail, "#ffffff", 0.18))
    }
  }
}

function drawTufts(b: Brush, pal: Palette, t: number, season: Season) {
  for (let i = 0; i < 30; i++) {
    const x = -12 + i * 3.9 + hash(i * 3.3) * 2
    const y = 148 + hash(i * 7.1) * 20
    if (x > 43 && x < 73 && y > 147) continue
    if (y > 139 && y < 146 && x > 14 && x < 30) continue
    const sw = Math.sin(t * 1.3 + i * 0.8) * 0.6
    b.r(x, y, 0.5, 2.6, pal.grassDark)
    b.r(x + 0.7 + sw, y + 0.5, 0.5, 2.1, pal.grassDark)
    b.r(x - 0.7 + sw, y + 0.9, 0.5, 1.7, pal.grassDark)
  }
  const petals = ["#f2e6a0", "#f0a8c0", "#e8eef4", "#d8b0f0"]
  const bloom = season === "winter" ? 0 : season === "autumn" ? 6 : 11
  for (let i = 0; i < bloom; i++) {
    const x = -10 + hash(i * 5.7) * 98
    const y = 150 + hash(i * 9.3) * 18
    if (x > 43 && x < 73 && y > 147) continue
    const sw = Math.sin(t * 1.1 + i) * 0.4
    b.r(x + sw, y, 0.5, 2.2, pal.grassDark)
    b.r(x - 0.6 + sw, y - 0.7, 1.7, 1.1, acc(pal, petals[i % petals.length], 0.3), 0.95)
  }
}

/* ------------------------------------------------------------------ */
/* 季节物件                                                          */
/* ------------------------------------------------------------------ */

function drawPumpkins(b: Brush, pal: Palette) {
  const spots: [number, number, number][] = [
    [40.6, 137.2, 1],
    [46.2, 138.2, 0.85],
    [52.4, 137.6, 1.1],
  ]
  for (const [x, y, s] of spots) {
    const w = 3.2 * s
    const h = 2.4 * s
    b.r(x - w / 2, y, w, h, acc(pal, "#d0711e"))
    b.r(x - w / 2, y, w, 0.55 * s, acc(pal, "#e8942e", 0.32))
    b.r(x - w / 2, y + h - 0.5 * s, w, 0.5 * s, acc(pal, "#a04c16"))
    b.r(x - w * 0.18, y, w * 0.14, h, acc(pal, "#b85c18"), 0.7)
    b.r(x + w * 0.2, y, w * 0.12, h, acc(pal, "#b85c18"), 0.5)
    b.r(x - 0.2 * s, y - 0.65 * s, 0.5 * s, 0.8 * s, acc(pal, "#4f7a30"))
  }
}

/** 田里的稻草人：一年到头就它不换衣服 */
function drawScarecrow(b: Brush, pal: Palette, t: number, now: number) {
  const x = 60.2
  const top = 116.2
  const sway = Math.round(Math.sin(t * 0.9) * 0.4 * 10) / 10
  // 走到它跟前时它会点两下头（只有麻袋头和斗笠往下沉，轩子不动）
  const nod = pulse("scarecrow", now)
  const nodY = nod > 0 ? Math.round(Math.abs(Math.sin((1 - nod) * 7)) * 0.7 * 10) / 10 : 0
  const nodX = nod > 0 ? Math.round(Math.sin((1 - nod) * 7) * 0.3 * 10) / 10 : 0
  const hy = top + nodY
  const hx = x + nodX
  const wood = mix(pal.path, "#6a4a28", 0.62)
  b.r(x - 0.42, top + 3.4, 0.85, 15, wood)
  b.r(x - 3.2, top + 5.4, 6.6, 0.7, wood)
  // 稻草手
  b.r(x - 4.4, top + 5.05, 1.5, 1.25, acc(pal, "#d8b45a"))
  b.r(x + 3.1, top + 5.05, 1.5, 1.25, acc(pal, "#d8b45a"))
  // 外套
  b.r(x - 2.1, top + 4.6, 4.4, 5.2, acc(pal, "#9a4436"))
  b.r(x - 2.1, top + 4.6, 4.4, 1, acc(pal, "#bb5644", 0.3))
  b.r(x - 2.1, top + 8.4, 4.4, 1.4, acc(pal, "#7d3428"))
  b.r(x - 2.1, top + 9.9, 0.7, 1.2, acc(pal, "#d8b45a"))
  b.r(x + 1.4, top + 9.9, 0.7, 1.2, acc(pal, "#d8b45a"))
  // 麻袋头
  b.r(hx - 1.35 + sway, hy + 1.9, 2.7, 2.8, acc(pal, "#e6d6a4", 0.34))
  b.r(hx - 1.35 + sway, hy + 1.9, 2.7, 0.7, acc(pal, "#f2e6c0", 0.36))
  b.r(hx - 0.85 + sway, hy + 2.75, 0.5, 0.5, "#3a2a1a")
  b.r(hx + 0.4 + sway, hy + 2.75, 0.5, 0.5, "#3a2a1a")
  b.r(hx - 0.6 + sway, hy + 3.5, 1.4, 0.4, "#3a2a1a")
  // 斗笠
  b.r(hx - 2.1 + sway, hy + 1.5, 4.3, 0.7, acc(pal, "#c8a458"))
  b.r(hx - 1 + sway, hy + 0.5, 2.2, 1.1, acc(pal, "#dcbb6a", 0.3))
}

/** 屋前空地：同一个位置，四季换成不同的东西 */
function drawSeasonProp(b: Brush, pal: Palette, t: number, season: Season) {
  const px = 27
  if (season === "spring") {
    // 一丛郁金香
    const colors = ["#f07a9a", "#f2c24e", "#e8688a", "#f4e6a8"]
    for (let i = 0; i < 4; i++) {
      const x = px - 2.4 + i * 2.7
      const y = 155.8 + (i % 2) * 1.5
      const sw = Math.sin(t * 1.2 + i) * 0.35
      b.r(x + sw, y + 1.4, 0.55, 4, pal.grassDark)
      b.r(x - 0.9 + sw, y + 4, 1.3, 0.9, pal.grassLit)
      const c = acc(pal, colors[i], 0.34)
      b.r(x - 0.85 + sw, y - 0.5, 2, 2, c)
      b.r(x - 0.85 + sw, y - 1, 0.8, 0.9, mix(c, "#ffffff", 0.34))
      b.r(x + 0.5 + sw, y - 0.6, 0.7, 0.8, mix(c, "#ffffff", 0.16))
    }
    return
  }
  if (season === "summer") {
    // 两株向日葵，花瓣比篱笆高
    const heads: [number, number, number][] = [
      [px - 1.6, 147.6, 1],
      [px + 3.4, 150.4, 0.76],
    ]
    for (const [x, hy, s] of heads) {
      const sw = Math.sin(t * 1.1 + x) * 0.4
      b.r(x - 0.38 + sw, hy + 1.4 * s, 0.78, 12.5, mix(pal.grassDark, "#4a7a2e", 0.55))
      b.r(x - 2.3 + sw, hy + 5.2, 2.3, 1.2, mix(pal.grass, "#3f6e28", 0.3))
      b.r(x + 0.9 + sw, hy + 7.4, 2.3, 1.2, mix(pal.grass, "#3f6e28", 0.3))
      const r = 2.5 * s
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 6.283
        b.r(x + Math.cos(a) * r - 0.55, hy + Math.sin(a) * r - 0.55, 1.15, 1.15, acc(pal, "#eec22a", 0.3))
      }
      b.r(x - r * 0.66, hy - r * 0.66, r * 1.32, r * 1.32, acc(pal, "#f7d84a", 0.32))
      b.r(x - 1.05 * s + sw * 0.3, hy - 1.05 * s, 2.1 * s, 2.1 * s, acc(pal, "#6a4a1e"))
    }
    return
  }
  if (season === "autumn") {
    // 南瓜堆
    const spots: [number, number, number][] = [
      [px - 2.6, 158.2, 1.15],
      [px + 1.4, 159.6, 0.95],
      [px - 0.2, 155.8, 0.8],
    ]
    for (const [x, y, s] of spots) {
      const w = 3.4 * s
      const h = 2.6 * s
      b.r(x - w / 2, y, w, h, acc(pal, "#d0711e"))
      b.r(x - w / 2, y, w, 0.6 * s, acc(pal, "#e8942e", 0.32))
      b.r(x - w / 2, y + h - 0.5 * s, w, 0.5 * s, acc(pal, "#a04c16"))
      b.r(x - w * 0.18, y, w * 0.13, h, acc(pal, "#b85c18"), 0.65)
      b.r(x - 0.2 * s, y - 0.7 * s, 0.55 * s, 0.85 * s, acc(pal, "#4f7a30"))
    }
    return
  }
  // 冬天：雪人
  const sw = Math.round(Math.sin(t * 0.7) * 0.2 * 10) / 10
  oval(b, px, 159.4, 2.7, 2.3, "#eef5fa")
  oval(b, px - 0.6, 158.6, 1.5, 1.3, "#ffffff", 0.55)
  oval(b, px, 155.6, 2.05, 1.85, "#f2f8fc")
  oval(b, px, 152.4, 1.45, 1.4, "#fbfdff")
  // 眼睛 + 胡萝卜鼻
  b.r(px - 0.75, 152.1, 0.45, 0.45, "#2a2a32")
  b.r(px + 0.35, 152.1, 0.45, 0.45, "#2a2a32")
  b.r(px - 0.1, 152.7, 1, 0.4, "#e8873a")
  // 围巾
  b.r(px - 1.5, 153.7, 3.1, 0.8, "#c84a4a")
  b.r(px + 1, 154.2, 0.8, 1.6, "#b03c3c")
  // 帽子
  b.r(px - 1.7, 150.9, 3.5, 0.5, "#3a3a48")
  b.r(px - 1.05, 149, 2.1, 1.9, "#3a3a48")
  b.r(px - 1.05, 149.9, 2.1, 0.5, "#5a5a6c")
  // 树枝手
  b.r(px - 3.4, 155.2, 1.4, 0.45, "#6a5040")
  b.r(px + 2, 155.2, 1.4, 0.45, "#6a5040")
  void sw
}

/** 天上飘的东西：春天的樱花瓣、秋天的落叶 */
function drawSeasonParticles(b: Brush, pal: Palette, t: number, season: Season, kind: WeatherKind) {
  if (season !== "spring" && season !== "autumn") return
  if (kind === "storm") return
  const n = season === "spring" ? 26 : 20
  const fade = kind === "rain" || kind === "snow" ? 0.55 : 1
  for (let i = 0; i < n; i++) {
    const sp = (season === "spring" ? 6 : 9) + hash(i * 2.3) * 7
    const y = ((hash(i * 4.9) * 128 + t * sp) % 128) + 64
    const x =
      -12 + hash(i * 6.1) * 106 + Math.sin(t * 0.9 + i * 1.3) * (season === "spring" ? 3 : 4.2)
    const c =
      season === "spring"
        ? i % 3 === 0
          ? "#ffd6e4"
          : i % 3 === 1
            ? "#f7bdd2"
            : "#fff0f6"
        : ["#e8a840", "#c9762e", "#f0c860", "#a85a24"][i % 4]
    if (season === "spring") b.r(x, y, 0.95, 0.7, acc(pal, c, 0.2), 0.9 * fade)
    else b.r(x, y, 1.2, 0.85, acc(pal, c, 0.2), 0.92 * fade)
  }
}

/** 冬天的霜：不是雪天也给地上铺一层白气 */
function drawFrost(b: Brush, t: number) {
  b.r(-14, 104, 108, 74, "#dfeaf0", 0.09)
  for (let i = 0; i < 16; i++) {
    const x = -12 + hash(i * 3.7) * 104
    const y = 120 + hash(i * 7.9) * 48
    if (x > 36 && x < 64 && y > 114 && y < 142) continue
    const w = 4 + hash(i * 2.1) * 9
    b.r(x, y, w, 1.2, "#eef6fb", 0.16 + 0.06 * Math.sin(t * 0.4 + i))
  }
}

function drawChicken(b: Brush, pal: Palette, t: number) {
  const homeX = 33 + Math.sin(t * 0.11) * 5.5
  const homeY = 146.6
  // 我一走过去，它就改成绕着我转圈（越近越兴奋）
  const d = Math.hypot(player.x - homeX, player.y - homeY)
  const orbit = Math.max(0, Math.min(1, (9.5 - d) / 4))
  const peck = orbit > 0.06 ? 0 : Math.sin(t * 2.6) > 0.82 ? 0.6 : 0
  const ox = player.x + Math.cos(t * 1.7) * 4.6
  const oy = player.y + 1.4 + Math.sin(t * 1.7) * 1.6
  const x = homeX + (ox - homeX) * orbit
  const y = homeY + (oy - 2 - homeY) * orbit + peck
  const white = acc(pal, "#f4f0e6", 0.3)
  b.r(x, y, 2.8, 2.1, white)
  b.r(x - 0.8, y + 0.3, 0.9, 1.4, mix(white, "#b0b4c0", 0.3))
  b.r(x + 2.2, y - 1.4, 1.7, 1.7, white)
  b.r(x + 2.5, y - 2.1, 1, 0.9, "#e05a4a")
  b.r(x + 3.9, y - 0.9 + peck * 0.5, 1, 0.5, "#e8a83a")
  b.r(x + 0.6, y + 2.1, 0.4, 1.1, "#e8a83a")
  b.r(x + 1.9, y + 2.1, 0.4, 1.1, "#e8a83a")
}

function drawCat(b: Brush, pal: Palette, t: number) {
  const fur = pal.dark > 0.7 ? "#4a3a30" : "#6a5240"
  const y = 130.3
  b.r(28.4, y, 3.6, 1.7, fur)
  b.r(27.3, y - 1.1, 1.5, 1.6, fur)
  b.r(27.3, y - 2, 0.6, 1, fur)
  b.r(28.3, y - 2, 0.6, 1, fur)
  b.r(28, y - 0.5, 0.5, 0.4, "#e8d8a0")
  b.r(27.9, y - 1.1, 0.5, 0.4, "#e8d8a0")
  const w = Math.sin(t * 1.4) * 0.9
  b.r(31.9, y + 0.5, 1.6, 0.5, fur)
  b.r(33.4, y + 0.2 + w * 0.4, 0.5, 1.2, fur)
}

function drawBirds(b: Brush, pal: Palette, t: number) {
  if (pal.dark > 0.5) return
  const c = mix("#ffffff", pal.treeDark, 0.45)
  for (let i = 0; i < 3; i++) {
    const x = ((t * (2.6 + i * 0.7) + i * 46) % 150) - 34
    const y = 40 + i * 10 + Math.sin(t * 0.5 + i * 1.7) * 3.4
    const flap = Math.sin(t * 5.4 + i * 2.1) > 0 ? 0.7 : -0.7
    b.r(x, y, 1.5, 0.5, c, 0.85)
    b.r(x + 1.4, y - flap, 1.3, 0.5, c, 0.85)
  }
}

function drawFireflies(b: Brush, pal: Palette, t: number, season: Season) {
  const lvl = pal.fireflies * SEASON_FIREFLY[season]
  if (lvl < 0.05) return
  const n = Math.max(2, Math.round(14 * SEASON_FIREFLY[season]))
  for (let i = 0; i < n; i++) {
    const bx = -8 + hash(i * 2.71) * 96
    const by = 118 + hash(i * 5.93) * 46
    if (bx > 43 && bx < 73 && by > 147) continue
    const x = bx + Math.sin(t * 0.45 + i * 1.7) * 3.2
    const y = by + Math.cos(t * 0.33 + i * 2.3) * 2.6
    const a = lvl * (0.3 + 0.7 * Math.abs(Math.sin(t * 2.1 + i * 1.1)))
    oval(b, x, y, 1.9, 1.6, "#c8f07a", a * 0.16)
    b.r(x - 0.4, y - 0.4, 0.9, 0.9, "#eaffa0", a)
  }
  // 跟着我飘的几只：人走到哪儿它们就绕到哪儿
  if (lvl > 0.15) {
    for (let i = 0; i < 3; i++) {
      const a = t * 0.62 + i * 2.1
      const rr = 3.2 + i * 1.2 + Math.sin(t * 0.7 + i) * 0.7
      const x = player.x + Math.cos(a) * rr
      const y = player.y - 5.5 + Math.sin(a * 0.82) * rr * 0.62
      const al = lvl * (0.35 + 0.65 * Math.abs(Math.sin(t * 2.3 + i * 1.9)))
      oval(b, x, y, 1.9, 1.6, "#c8f07a", al * 0.16)
      b.r(x - 0.4, y - 0.4, 0.9, 0.9, "#eaffa0", al)
    }
  }
}

/* ------------------------------------------------------------------ */
/* 住进来的那个人                                                      */
/* ------------------------------------------------------------------ */

let lastSize: Size = { width: 390, height: 800 }
let lastNow = -1

/** 把画布上的点击点换算回世界坐标（和 Brush 用同一套 cover 变换） */
export function tapToWorld(pt: { x: number; y: number }): { x: number; y: number } {
  const s = Math.max(lastSize.width / VW, lastSize.height / VH)
  const ox = (lastSize.width - VW * s) / 2
  const oy = (lastSize.height - VH * s) / 2
  const x = (pt.x - ox) / s
  const y = (pt.y - oy) / s
  // 池塘踩不得：点到水里就把目标推到岸边
  const rx = POND.rx + 1.8
  const ry = POND.ry + 1.8
  const nx = (x - POND.x) / rx
  const ny = (y - POND.y) / ry
  const d = Math.sqrt(nx * nx + ny * ny)
  if (d < 1) {
    if (d < 0.001) return { x: POND.x, y: POND.y - ry }
    return { x: POND.x + (nx / d) * rx, y: POND.y + (ny / d) * ry }
  }
  return { x, y }
}

const POND = { x: 58, y: 157, rx: 13, ry: 8 }

/**
 * 角色是现成的像素精灵图（petdex 的 deepseek 酱），烘成三行：
 *   第 0 行 待机 6 帧、第 1 行 向右跑 8 帧、第 2 行 向左跑 8 帧。
 * 每帧 72 × 78，脚底在帧内第 75 像素，水平中心 36。
 * 直接 1:1 贴，不缩放，所以和场景里那些方块一样硬。
 */
const SPR = {
  fw: 72,
  fh: 78,
  cx: 36,
  feet: 75,
  day: "whale_day.png",
  night: "whale_night.png",
  idleFrames: 6,
  runFrames: 8,
  waveFrames: 4,
}

let spriteDir: string | null = null
function spritePath(name: string): string {
  if (spriteDir === null) spriteDir = Script.directory
  return spriteDir + "/" + name
}

/** 画一帧精灵图；k 是整数倍缩放（正常手机上就是 1） */
function drawSprite(b: Brush, file: string, col: number, row: number, sx: number, sy: number, k: number, alpha: number) {
  const ctx = b.ctx
  const prev = ctx.globalAlpha
  if (alpha < 1) ctx.globalAlpha = prev * alpha
  ctx.drawImage(
    { filePath: spritePath(file) },
    col * SPR.fw,
    row * SPR.fh,
    SPR.fw,
    SPR.fh,
    sx,
    sy,
    SPR.fw * k,
    SPR.fh * k,
  )
  ctx.globalAlpha = prev
}

/** 住在农场里的小鲸鱼娘：高约 14.5 单位，待机/走路都有逐帧动画 */
function drawPlayer(b: Brush, pal: Palette, t: number) {
  const p = player
  const k = Math.max(1, Math.round(b.s / 5))
  const sx = Math.round(b.ox + p.x * b.s) - SPR.cx * k
  const sy = Math.round(b.oy + p.y * b.s) - SPR.feet * k

  // 影子：三行叠成椭圆，别成一个方块
  const sh = mix(pal.grass, "#000000", 0.55)
  b.r(p.x - 2.8, p.y + 0.1, 5.6, 0.45, sh, 0.22)
  b.r(p.x - 3.5, p.y + 0.5, 7.0, 0.4, sh, 0.24)
  b.r(p.x - 2.9, p.y + 0.88, 5.8, 0.34, sh, 0.18)

  const runRow = p.face > 0 ? 1 : 2
  let row: number
  let frames: number
  let fps: number
  if (p.reactKind !== "") {
    // 喷到东西了：挥挥手
    row = 3
    frames = SPR.waveFrames
    fps = 7
  } else if (p.moving) {
    row = runRow
    frames = SPR.runFrames
    fps = 11
  } else {
    row = 0
    frames = SPR.idleFrames
    fps = 5
  }
  const col = Math.floor(t * fps) % frames

  // 白天版打底，夜色再按暗度叠一层夜版，颜色就跟着调色板一起沉下去
  drawSprite(b, SPR.day, col, row, sx, sy, k, 1)
  const dark = Math.min(1, Math.max(0, pal.dark))
  if (dark > 0.02) drawSprite(b, SPR.night, col, row, sx, sy, k, dark)

  // 入夜自己会提灯
  if (pal.dark > 0.32) {
    const f = p.face
    const lx = p.x + f * 5.9
    const ly = p.y - 7.0
    oval(b, p.x, p.y, 5.8, 1.8, "#ffcf78", 0.05 * pal.dark)
    for (let i = 3; i >= 1; i--) oval(b, lx, ly, i * 1.7, i * 1.6, "#ffcf78", 0.08 * pal.dark)
    b.r(lx - 0.55, ly - 0.8, 1.1, 1.55, acc(pal, "#e8a848", 0.85))
    b.r(lx - 0.3, ly - 0.45, 0.6, 0.9, "#ffe9a8")
    b.r(lx - 0.18, ly - 1.3, 0.36, 0.5, acc(pal, "#8a6a3a", 0.7))
    // 提灯的小提手
    b.r(lx - 0.06, ly + 0.75, 0.12, 0.9, acc(pal, "#8a6a3a", 0.7), 0.9)
  }
}

/* ------------------------------------------------------------------ */
/* 碰得到的东西                                                        */
/* ------------------------------------------------------------------ */

type Spot = { id: SpotId; x: number; y: number; r: number; line: (s: Season) => string }

const SPOTS: Spot[] = [
  {
    id: "field",
    x: 47,
    y: 146,
    r: 12,
    line: s =>
      s === "spring"
        ? "嫩苗刚冒头，蹭了蹭手"
        : s === "summer"
          ? "叶子铺了一地，长得真野"
          : s === "autumn"
            ? "穗子沉得压手，快能收了"
            : "只剩短茬，踩着有点脆",
  },
  {
    id: "scarecrow",
    x: 60.2,
    y: 133,
    r: 7,
    line: () => "它点了两下头，草笠往前一沉",
  },
  {
    id: "pond",
    x: 57,
    y: 156,
    r: 15,
    line: s => (s === "winter" ? "水面结了薄冰，碰一下就碎" : "手指一碰，水面荡开一圈"),
  },
  {
    id: "tree",
    x: 68,
    y: 137,
    r: 7.5,
    line: s =>
      s === "spring"
        ? "推了一下，落了一身樱花瓣"
        : s === "autumn"
          ? "晃下来几片黄叶"
          : s === "winter"
            ? "树枝上的雪扑簌落下来"
            : "树冠沙沙响了一阵",
  },
  {
    id: "house",
    x: 21.7,
    y: 134,
    r: 7,
    line: () => "门是锁着的，从窗缝里透出一点暖光",
  },
  {
    id: "prop",
    x: 27,
    y: 157,
    r: 5.5,
    line: s =>
      s === "spring"
        ? "郁金香开得正好"
        : s === "summer"
          ? "向日葵把头低下来让我摸"
          : s === "autumn"
            ? "南瓜堆得满满当当"
            : "雪人的胡萝卜鼻子有点歪",
  },
  {
    id: "chicken",
    x: 33,
    y: 147,
    r: 6,
    line: () => "它绕着我转了一圈，咕咕叫",
  },
]

/** 走到东西旁边就触一下；移动中不触发，免得跑过田也弹字 */
let spotHook: ((id: SpotId) => void) | null = null

/** 碰触真的成功了才叫；音频那边按 SpotId 配音效 */
export function onSpotTouch(fn: ((id: SpotId) => void) | null) {
  spotHook = fn
}

function touchSpots(now: number, season: Season) {
  if (player.moving || player.cool > 0) return
  let best: Spot | null = null
  let bestD = Infinity
  for (const s of SPOTS) {
    const d = Math.hypot(player.x - s.x, player.y - s.y)
    if (d < s.r && d < bestD) {
      best = s
      bestD = d
    }
  }
  if (best && react(best.id, now, best.line(season))) spotHook?.(best.id)
}

/* ------------------------------------------------------------------ */
/* 天气粒子                                                            */
/* ------------------------------------------------------------------ */

function drawRain(b: Brush, t: number, storm: boolean) {
  const n = storm ? 120 : 74
  const col = storm ? "#a8c6de" : "#bcd4e6"
  for (let i = 0; i < n; i++) {
    const sp = 32 + hash(i * 3.11) * 30
    const x = -14 + hash(i * 7.73) * 108 + Math.sin(t * 0.6 + i) * 0.5
    const y = ((hash(i * 5.37) * 210 + t * sp) % 210) - 24
    const len = storm ? 4.4 : 3.2
    b.r(x, y, 0.42, len, col, storm ? 0.5 : 0.42)
  }
  // 地面溅起的小水花
  for (let i = 0; i < 10; i++) {
    const k = (t * 1.6 + i * 0.37) % 1
    const x = -10 + hash(i * 4.7) * 100
    const y = 138 + hash(i * 6.1) * 30
    if (k < 0.35) b.r(x, y, 1.6, 0.4, col, 0.35 * (1 - k / 0.35))
  }
}

function drawSnow(b: Brush, t: number) {
  for (let i = 0; i < 86; i++) {
    const sp = 5 + hash(i * 2.91) * 9
    const y = ((hash(i * 6.13) * 210 + t * sp) % 210) - 20
    const x = -14 + hash(i * 4.31) * 108 + Math.sin(t * 0.8 + i * 1.3) * 3.4
    const s = 0.7 + hash(i * 8.87) * 0.7
    b.r(x, y, s, s, "#f4f9ff", 0.78)
  }
  // 地面积雪
  b.r(-14, 140, 108, 3.4, "#e8f0f6", 0.22)
  b.r(-14, 160, 108, 12, "#eef5fa", 0.16)
}

function drawFog(b: Brush, t: number, strength: number) {
  for (let i = 0; i < 4; i++) {
    const y = 92 + i * 17
    const x = -30 + Math.sin(t * 0.11 + i * 1.7) * 26 + i * 4
    b.r(x, y, 150, 7 + i * 2, "#dfe7ea", strength * (0.11 + i * 0.02))
  }
}

/** 闪电的节拍：每 2.8 秒一个槽位，一半的槽位真的闪，闪 0.36 秒。
 *  画面和声音都从这里取，所以雷一定跟着闪电走 —— 两边各算一套就会割裂。 */
export const FLASH_SEG = 2.8

export function flashAt(t: number) {
  const n = Math.floor(t / FLASH_SEG)
  const local = t - n * FLASH_SEG
  const lit = hash(n * 3.71) >= 0.5
  return { n, local, lit, visible: lit && local <= 0.36 }
}

function drawLightning(b: Brush, t: number) {
  const f = flashAt(t)
  if (!f.visible) return
  const n = f.n
  const local = f.local
  const a = local < 0.1 ? 0.62 : local < 0.18 ? 0.2 : local < 0.28 ? 0.44 : 0.1
  b.cover("#dbe8ff", a)
  if (local < 0.22) {
    let x = 16 + hash(n * 5.11) * 46
    let y = 18
    for (let i = 0; i < 7; i++) {
      const nx = x + (hash(n * 7.33 + i * 2.2) - 0.5) * 10
      const ny = y + 6.5
      b.line(x, y, nx, ny, 0.8, "#ffffff", 0.9)
      x = nx
      y = ny
    }
  }
}

function drawVignette(b: Brush) {
  const g = b.ctx.createRadialGradient(
    b.w / 2,
    b.h * 0.4,
    Math.min(b.w, b.h) * 0.22,
    b.w / 2,
    b.h * 0.5,
    Math.max(b.w, b.h) * 0.72
  )
  g.addColorStop(0, "rgba(0,0,0,0)")
  g.addColorStop(1, "rgba(0,0,0,0.40)")
  b.ctx.fillStyle = g
  b.ctx.fillRect(0, 0, b.w, b.h)
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

export const perf = { frames: 0 }

export function drawFrame(ctx: CanvasRenderingContext, size: Size, frame: Frame) {
  perf.frames++
  const b = new Brush(ctx, size)
  const pal = gradePalette(applySeason(paletteAt(frame.hour), frame.season), frame.weather)
  const t = Math.floor(frame.t * 12) / 12 // 12fps 的像素节奇
  const kind = frame.weather
  const season = frame.season

  // 她的时间：直接用画布的相对秒，暂停、切标签回来都不会一下子瞬移
  lastSize = size
  const now = frame.t
  const dt = lastNow < 0 ? 0 : Math.min(0.25, Math.max(0, now - lastNow))
  lastNow = now
  updatePlayer(dt, now)
  touchSpots(now, season)

  b.cover(pal.sky[0])
  drawSky(b, pal)
  drawStars(b, pal, t, season)
  drawCelestial(b, pal, frame.hour, kind !== "clear" && kind !== "cloudy")
  drawOvercast(b, pal, t, kind)
  drawClouds(b, pal, t, kind, frame.hour)
  drawRidge(b, 100, 30, 11, pal.farRidge)
  drawRidge(b, 104, 16, 47, pal.nearRidge)

  // 地面
  b.r(-14, 104, 108, 74, pal.grass)
  b.r(-14, 104, 108, 6, mix(pal.grass, pal.hill, 0.55))
  b.r(-14, 160, 108, 18, mix(pal.grass, pal.grassDark, 0.4))
  drawTreeLine(b, pal, 105)

  drawField(b, pal, t, kind, season)
  drawScarecrow(b, pal, t, now)
  drawPath(b, pal)
  drawPond(b, pal, t, now)
  drawFence(b, pal)
  drawHouse(b, pal, t)
  drawOak(b, pal, t, season, now)
  drawTufts(b, pal, t, season)
  drawSeasonProp(b, pal, t, season)
  drawCat(b, pal, t)
  drawChicken(b, pal, t)
  drawPlayer(b, pal, t)
  drawBirds(b, pal, t)
  drawFireflies(b, pal, t, season)
  if (season === "winter" && kind !== "snow") drawFrost(b, t)
  drawSeasonParticles(b, pal, t, season, kind)

  // 天气层
  if (kind === "cloudy") b.cover("#8a94a0", 0.05)
  if (kind === "fog") drawFog(b, t, 1)
  if (kind === "rain") {
    b.cover("#2f3c4a", 0.12)
    drawRain(b, t, false)
  }
  if (kind === "storm") {
    b.cover("#20262e", 0.16)
    drawRain(b, t, true)
    drawLightning(b, t)
  }
  if (kind === "snow") {
    b.cover("#dfe9f0", 0.06)
    drawSnow(b, t)
  }

  drawVignette(b)
}

export type Frame = {
  hour: number
  t: number
  weather: WeatherKind
  season: Season
}

