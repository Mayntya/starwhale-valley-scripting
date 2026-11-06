/**
 * theme.ts — 配色引擎
 *
 * 一昼夜被切成若干「关键帧调色板」，任意时刻的调色板由邻近两帧按 smoothstep
 * 插值得到；天气再在插值结果上叠一层调色（降饱和 / 压暗 / 偏色）。
 * 场景里所有颜色都从这里取，所以换季、换天气、换时段只要改这一个文件。
 */

export type WeatherKind = "clear" | "cloudy" | "rain" | "storm" | "snow" | "fog"

export type Palette = {
  sky: string[] // 从上到下 6 段
  sun: string
  sunGlow: string
  cloud: string
  cloudShade: string
  farRidge: string
  nearRidge: string
  hill: string
  hillLit: string
  treeDark: string
  treeMid: string
  treeLit: string
  grass: string
  grassLit: string
  grassDark: string
  soil: string
  soilDark: string
  wall: string
  wallShade: string
  roof: string
  roofShade: string
  window: string
  water: string
  waterHi: string
  stone: string
  path: string
  /** 0..1 夜色浓度：控制窗灯、星空、萤火虫 */
  dark: number
  stars: number
  fireflies: number
}

/* ------------------------------------------------------------------ */
/* 颜色工具                                                            */
/* ------------------------------------------------------------------ */

function parse(hex: string): [number, number, number] {
  const s = hex.replace("#", "")
  const v = parseInt(
    s.length === 3
      ? s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
      : s,
    16
  )
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

/** 在两个 #rrggbb 之间插值 */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parse(a)
  const [r2, g2, b2] = parse(b)
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

/** 带 alpha 的 rgba 字符串（Canvas 用） */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = parse(hex)
  return `rgba(${r},${g},${b},${a})`
}

/* ------------------------------------------------------------------ */
/* 关键帧                                                              */
/* ------------------------------------------------------------------ */

const BASE: Palette = {
  sky: ["#3d8ede", "#57a2e6", "#7ab8ec", "#a2d0f0", "#cde8f4", "#e6f4f6"],
  sun: "#ffe98a",
  sunGlow: "#ffeaaa",
  cloud: "#ffffff",
  cloudShade: "#dfe9f2",
  farRidge: "#93b0cc",
  nearRidge: "#6f90ae",
  hill: "#7fb070",
  hillLit: "#a2c882",
  treeDark: "#2b5236",
  treeMid: "#3a6a42",
  treeLit: "#548a4c",
  grass: "#6ba85c",
  grassLit: "#8fc674",
  grassDark: "#4f8046",
  soil: "#8a6a4a",
  soilDark: "#6a5038",
  wall: "#e6c9a0",
  wallShade: "#bfa079",
  roof: "#c25a48",
  roofShade: "#9a4438",
  window: "#ffe6a0",
  water: "#5a92b0",
  waterHi: "#a8d0e0",
  stone: "#9a9a96",
  path: "#cbb392",
  dark: 0,
  stars: 0,
  fireflies: 0,
}

const DEEP_NIGHT: Palette = {
  ...BASE,
  sky: ["#0a0f24", "#0f1836", "#152143", "#1c2b50", "#24365e", "#2c436b"],
  sun: "#eef3ff",
  sunGlow: "#3f5079",
  cloud: "#28345a",
  cloudShade: "#1a2240",
  farRidge: "#1a2646",
  nearRidge: "#141d3a",
  hill: "#17263a",
  hillLit: "#203349",
  treeDark: "#0e1828",
  treeMid: "#142034",
  treeLit: "#1b2b42",
  grass: "#182b3c",
  grassLit: "#21394a",
  grassDark: "#101f2e",
  soil: "#2a2436",
  soilDark: "#1c1828",
  wall: "#3c3450",
  wallShade: "#2b2640",
  roof: "#352a44",
  roofShade: "#251d32",
  window: "#ffd489",
  water: "#14203a",
  waterHi: "#2a4064",
  stone: "#2a3246",
  path: "#312c40",
  dark: 1,
  stars: 1,
  fireflies: 1,
}

const PRE_DAWN: Palette = {
  ...DEEP_NIGHT,
  sky: ["#141d3e", "#1d2850", "#2c3a63", "#3f4a72", "#5a5478", "#77607c"],
  sunGlow: "#5f5378",
  farRidge: "#28325a",
  nearRidge: "#20284a",
  hill: "#233046",
  grass: "#22344a",
  dark: 0.86,
  stars: 0.85,
  fireflies: 0.6,
}

const DAWN: Palette = {
  ...BASE,
  sky: ["#2a3266", "#4a4585", "#8a6a9d", "#cf8583", "#efa679", "#ffd2a4"],
  sun: "#fff0c4",
  sunGlow: "#ffb07a",
  cloud: "#e6aeb0",
  cloudShade: "#bd7f96",
  farRidge: "#6c5a86",
  nearRidge: "#4f446f",
  hill: "#4d5a5e",
  hillLit: "#71807a",
  treeDark: "#2c3842",
  treeMid: "#3a4750",
  treeLit: "#556148",
  grass: "#47574a",
  grassLit: "#61785f",
  grassDark: "#37463d",
  soil: "#4a3f38",
  soilDark: "#372e2a",
  wall: "#c9a985",
  wallShade: "#a18463",
  roof: "#8b4f43",
  roofShade: "#6b3a32",
  window: "#ffcf7d",
  water: "#4c5c74",
  waterHi: "#93a5b8",
  stone: "#6d6874",
  path: "#7b6b58",
  dark: 0.42,
  stars: 0.3,
  fireflies: 0.55,
}

const MORNING: Palette = {
  ...BASE,
  sky: ["#3f7fc4", "#5a97d6", "#7fb2e2", "#a8cbe8", "#d2e5f2", "#eaf3f4"],
  sun: "#fff6c8",
  sunGlow: "#ffe9a8",
  treeDark: "#33553a",
  treeMid: "#41694a",
  hill: "#7fa870",
}

const AFTERNOON: Palette = {
  ...BASE,
  sky: ["#4a86c8", "#6d9fd4", "#9bb9d6", "#cbb6b8", "#edbf98", "#ffd9a8"],
  sun: "#ffeeae",
  sunGlow: "#ffd184",
  hill: "#8aab6e",
  hillLit: "#aecb86",
  grass: "#78aa5e",
  grassLit: "#9cc676",
  dark: 0.06,
  fireflies: 0,
}

const DUSK: Palette = {
  ...BASE,
  sky: ["#1d2a52", "#3a3a6e", "#6b4a7c", "#a05a76", "#d4776b", "#f2a26c"],
  sun: "#ffb268",
  sunGlow: "#ff8a52",
  cloud: "#b0708a",
  cloudShade: "#7d4f6a",
  farRidge: "#5a4a72",
  nearRidge: "#413a5c",
  hill: "#3c4a52",
  hillLit: "#5c6a62",
  treeDark: "#222c34",
  treeMid: "#2e3c42",
  treeLit: "#44503e",
  grass: "#3f5446",
  grassLit: "#57684c",
  grassDark: "#2e3f36",
  soil: "#4a3c36",
  soilDark: "#332a28",
  wall: "#b08a6c",
  wallShade: "#8a6a54",
  roof: "#7b4239",
  roofShade: "#5c302b",
  window: "#ffd08a",
  water: "#3e4a68",
  waterHi: "#8a7a86",
  stone: "#5f5a66",
  path: "#6b5c4e",
  dark: 0.55,
  stars: 0.55,
  fireflies: 0.85,
}

const NIGHT: Palette = {
  ...DEEP_NIGHT,
  sky: ["#0d1430", "#121d3c", "#182848", "#1f3352", "#273c5c", "#324a68"],
  sunGlow: "#46587f",
  dark: 0.9,
  stars: 1,
  fireflies: 1,
}

const KEYS: [number, Palette][] = [
  [0, DEEP_NIGHT],
  [4.2, PRE_DAWN],
  [6.4, DAWN],
  [8.6, MORNING],
  [12.5, BASE],
  [16.6, AFTERNOON],
  [19.0, DUSK],
  [21.5, NIGHT],
  [24, DEEP_NIGHT],
]

function mixPalette(a: Palette, b: Palette, t: number): Palette {
  const out: any = {}
  for (const key of Object.keys(a) as (keyof Palette)[]) {
    const va = a[key]
    const vb = b[key]
    if (typeof va === "number" && typeof vb === "number") {
      out[key] = va + (vb - va) * t
    } else if (Array.isArray(va) && Array.isArray(vb)) {
      out[key] = va.map((c, i) => mix(c, vb[i] as string, t))
    } else {
      out[key] = mix(va as string, vb as string, t)
    }
  }
  return out as Palette
}

/** 一天中任意时刻（0..24，可带小数）的调色板 */
export function paletteAt(hour: number): Palette {
  const h = ((hour % 24) + 24) % 24
  let i = 0
  for (let k = 0; k < KEYS.length; k++) if (KEYS[k][0] <= h) i = k
  const a = KEYS[i]
  const b = KEYS[(i + 1) % KEYS.length]
  let span = b[0] - a[0]
  if (span <= 0) span += 24
  let d = h - a[0]
  if (d < 0) d += 24
  let t = span > 0 ? d / span : 0
  t = t * t * (3 - 2 * t) // smoothstep：切换时段时不会有硬跳
  return mixPalette(a[1], b[1], t)
}

/* ------------------------------------------------------------------ */
/* 天气分级                                                            */
/* ------------------------------------------------------------------ */

type Grade = { tint: string; amount: number; lift: number }

const GRADES: Record<WeatherKind, Grade> = {
  clear: { tint: "#000000", amount: 0, lift: 0 },
  cloudy: { tint: "#8f9aa8", amount: 0.3, lift: 0 },
  rain: { tint: "#57616d", amount: 0.5, lift: -0.14 },
  storm: { tint: "#2e3440", amount: 0.62, lift: -0.22 },
  snow: { tint: "#c3d0dc", amount: 0.42, lift: 0.04 },
  fog: { tint: "#bcc4c6", amount: 0.5, lift: 0.02 },
}

const COLOR_KEYS: (keyof Palette)[] = [
  "sun", "cloud", "cloudShade", "farRidge", "nearRidge", "hill", "hillLit",
  "treeDark", "treeMid", "treeLit", "grass", "grassLit", "grassDark",
  "soil", "soilDark", "wall", "wallShade", "roof", "roofShade",
  "water", "waterHi", "stone", "path",
]

/** 在时段调色板上叠天气影响 */
export function gradePalette(p: Palette, kind: WeatherKind): Palette {
  const g = GRADES[kind]
  if (g.amount === 0) return p
  const out: Palette = { ...p, sky: p.sky.map(c => mix(c, g.tint, g.amount * 0.9)) }
  const raw = out as any
  for (const k of COLOR_KEYS) {
    raw[k] = mix(p[k] as string, g.tint, g.amount * 0.8)
  }
  out.sunGlow = mix(p.sunGlow, g.tint, g.amount * 0.6)
  out.dark = Math.max(0, Math.min(1, p.dark - g.lift))
  if (kind === "rain" || kind === "storm" || kind === "fog") {
    out.stars = p.stars * 0.15
    out.fireflies = p.fireflies * 0.35
  }
  if (kind === "snow") {
    out.grassLit = mix(p.grassLit, "#f7fbfd", 0.8)
    out.grass = mix(p.grass, "#e9f1f6", 0.76)
    out.grassDark = mix(p.grassDark, "#cfdde8", 0.7)
    out.hill = mix(p.hill, "#e4edf3", 0.72)
    out.hillLit = mix(p.hillLit, "#f4f9fc", 0.76)
    out.soil = mix(p.soil, "#dfe7ec", 0.66)
    out.soilDark = mix(p.soilDark, "#c8d4dd", 0.6)
    out.path = mix(p.path, "#eef4f8", 0.7)
    out.water = mix(p.water, "#cfe2ee", 0.6)
    out.waterHi = mix(p.waterHi, "#f2f9ff", 0.7)
    out.treeMid = mix(p.treeMid, "#9fb4b8", 0.34)
    out.treeDark = mix(p.treeDark, "#7d949a", 0.3)
    out.treeLit = mix(p.treeLit, "#d8e6ec", 0.42)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 时间文本 / 天体                                                     */
/* ------------------------------------------------------------------ */

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

export function phaseLabel(hour: number): { zh: string; en: string } {
  const h = ((hour % 24) + 24) % 24
  if (h < 4.5) return { zh: "深夜", en: "DEEP NIGHT" }
  if (h < 6.5) return { zh: "破晓", en: "DAWN" }
  if (h < 9.5) return { zh: "清晨", en: "MORNING" }
  if (h < 15) return { zh: "白昼", en: "DAYLIGHT" }
  if (h < 18) return { zh: "午后", en: "AFTERNOON" }
  if (h < 20.2) return { zh: "黄昏", en: "DUSK" }
  if (h < 23) return { zh: "夜晚", en: "NIGHT" }
  return { zh: "深夜", en: "DEEP NIGHT" }
}

export type Celestial = {
  x: number
  y: number
  radius: number
  isSun: boolean
  visible: boolean
}

/**
 * 太阳 6:00 升起 / 18:00 落下，月亮 18:30 → 6:30。
 * 坐标系与场景一致：W=80, 地平线 y=98。
 */
export function celestialAt(hour: number): Celestial {
  const h = ((hour % 24) + 24) % 24
  if (h >= 5.4 && h <= 18.6) {
    const p = (h - 5.4) / 13.2
    return {
      x: -12 + p * 104,
      y: 96 - Math.sin(Math.PI * p) * 76,
      radius: 5,
      isSun: true,
      visible: true,
    }
  }
  let p = h >= 18.6 ? (h - 18.6) / 12 : (h + 5.4) / 12
  return {
    x: -10 + p * 100,
    y: 96 - Math.sin(Math.PI * p) * 66,
    radius: 4,
    isSun: false,
    visible: true,
  }
}

export const WEATHER_ZH: Record<WeatherKind, string> = {
  clear: "晴",
  cloudy: "多云",
  rain: "细雨",
  storm: "雷雨",
  snow: "落雪",
  fog: "薄雾",
}

export const WEATHER_EN: Record<WeatherKind, string> = {
  clear: "CLEAR",
  cloudy: "CLOUDY",
  rain: "RAIN",
  storm: "STORM",
  snow: "SNOW",
  fog: "FOG",
}
