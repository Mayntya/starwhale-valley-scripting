/**
 * season.ts — 四季
 *
 * 季节只做两件事：给调色板换一层底色（草/树/山/土的色相），
 * 以及告诉场景该长出什么东西（花瓣、麦穗、南瓜、雪人）。
 */

import { mix, type Palette } from "./theme"

export type Season = "spring" | "summer" | "autumn" | "winter"

export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"]

export const SEASON_ZH: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
}

export const SEASON_EN: Record<Season, string> = {
  spring: "SPRING",
  summer: "SUMMER",
  autumn: "AUTUMN",
  winter: "WINTER",
}

/** 面板上的小符号，刻意不用彩色 emoji，免得抢像素画的风头 */
export const SEASON_GLYPH: Record<Season, string> = {
  spring: "✿",
  summer: "☀",
  autumn: "❁",
  winter: "❄",
}

/** 萤火虫密度：夏天最多，冬天一只也没有 */
export const SEASON_FIREFLY: Record<Season, number> = {
  spring: 0.5,
  summer: 1,
  autumn: 0.68,
  winter: 0,
}

/** 流星频率：冬天夜空最干净，来得最勤 */
export const SEASON_METEOR: Record<Season, number> = {
  spring: 0.55,
  summer: 0.4,
  autumn: 0.75,
  winter: 1,
}

/** 3–5 春 / 6–8 夏 / 9–11 秋 / 12–2 冬（month 为 0-11） */
export function seasonOf(month: number): Season {
  if (month >= 2 && month <= 4) return "spring"
  if (month >= 5 && month <= 7) return "summer"
  if (month >= 8 && month <= 10) return "autumn"
  return "winter"
}

/**
 * 季节滤镜：先把时段调色板换成这个季节的底色，
 * 之后再叠天气分级，冬天的雪才不会把秋天又染回来。
 */
export function applySeason(p: Palette, s: Season): Palette {
  if (s === "summer") return p // 基准色就是盛夏
  const out: Palette = { ...p }
  const raw = out as any
  const to = (k: keyof Palette, color: string, amount: number) => {
    raw[k] = mix(p[k] as string, color, amount)
  }

  if (s === "spring") {
    to("grass", "#7cc46a", 0.34)
    to("grassLit", "#a8dc8c", 0.34)
    to("grassDark", "#5f9c56", 0.3)
    to("hill", "#92c87e", 0.32)
    to("hillLit", "#b8dea4", 0.32)
    to("treeDark", "#356b3c", 0.26)
    to("treeMid", "#4f8a48", 0.3)
    to("treeLit", "#82bd6c", 0.4)
    to("soil", "#8a6a4a", 0.12)
    return out
  }

  if (s === "autumn") {
    to("grass", "#b49c58", 0.7)
    to("grassLit", "#d4bc68", 0.7)
    to("grassDark", "#8f7c40", 0.66)
    to("hill", "#ab9350", 0.62)
    to("hillLit", "#cbb468", 0.62)
    to("treeDark", "#8a4a1e", 0.56)
    to("treeMid", "#c2701e", 0.7)
    to("treeLit", "#e0a03a", 0.7)
    to("soil", "#7a5638", 0.28)
    to("soilDark", "#5c3e28", 0.24)
    to("path", "#c8a878", 0.26)
    to("farRidge", "#a89a86", 0.2)
    return out
  }

  // winter
  to("grass", "#93a396", 0.56)
  to("grassLit", "#b8c6b8", 0.56)
  to("grassDark", "#77887c", 0.52)
  to("hill", "#8a9a9a", 0.46)
  to("hillLit", "#aab8b6", 0.46)
  to("treeDark", "#2e463e", 0.32)
  to("treeMid", "#466054", 0.36)
  to("treeLit", "#6a8070", 0.42)
  to("water", "#7c9aa8", 0.24)
  to("waterHi", "#c2d6e0", 0.2)
  to("farRidge", "#9fb0be", 0.22)
  return out
}
