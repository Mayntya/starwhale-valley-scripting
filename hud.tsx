/**
 * hud.tsx — 覆盖在农场上的面板
 * 刻意做得很轻：一块时钟、一块天气、一排小按钮，不抢画面。
 */

import { VStack, HStack, Spacer, Text, RoundedRectangle } from "scripting"
import type { ShapeStyle } from "scripting"
import {
  pad2,
  phaseLabel,
  WEATHER_EN,
  WEATHER_ZH,
  type WeatherKind,
} from "./theme"
import type { WeatherSnapshot } from "./weather"
import { SEASON_GLYPH, SEASON_ZH, type Season } from "./season"

const INK = "#f2efe4" as const
const DIM = "rgba(242,239,228,0.55)" as const
const FAINT = "rgba(242,239,228,0.34)" as const
const GOLD = "#e8c07a" as const
const PANEL_FILL = "rgba(8,12,18,0.58)" as const
const PANEL_EDGE = "rgba(255,255,255,0.13)" as const

/**
 * 背景板。★必须用 <RoundedRectangle> 把填色和描边一起带上。
 * 坑（已实测）：background={{ style, shape: { type: "rect", cornerRadius } }}
 * 里的 shape 会被忽略，照样画直角矩形；border 也只接受 { style, width }，
 * 永远是直角外框。想要圆角，只能把形状当一个视图塞进 background。
 */
function plate(radius: number, fill: ShapeStyle = PANEL_FILL, edge: ShapeStyle = PANEL_EDGE) {
  return (
    <RoundedRectangle
      cornerRadius={radius}
      fill={fill}
      stroke={{ shapeStyle: edge, strokeStyle: { lineWidth: 1.2 } }}
    />
  )
}

export const SPEEDS = [1, 60, 600]
export const SPEED_LABEL = ["实时", "×60", "×600"]
/** 三档音量：静音 / 轻 / 响。字少是因为面板上要塞得下 */
export const VOL_LABEL = ["◌ 静音", "♪ 轻", "♪♪ 响"]
/** 曲子单独的开关：很多人想要白噪音但不要旋律 */
export const MUSIC_LABEL = ["♫ 关", "♫ 轻", "♫♫ 响"]

function clockText(ms: number): string {
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function Chip(props: { label: string; active?: boolean; onTap: () => void }) {
  const { label, active, onTap } = props
  return (
    <Text
      font={{ name: "Menlo-Bold", size: 10 }}
      foregroundStyle={active ? "#1a1408" : INK}
      padding={{ horizontal: 10, vertical: 7 }}
      background={active ? plate(7, GOLD, GOLD) : plate(7)}
      onTapGesture={onTap}
    >
      {label}
    </Text>
  )
}

export type HudProps = {
  ms: number
  kind: WeatherKind
  snap: WeatherSnapshot | null
  manual: WeatherKind | null
  season: Season
  seasonAuto: boolean
  speedIdx: number
  paused: boolean
  /** 0 静音 / 1 轻 / 2 响 */
  level: 0 | 1 | 2
  /** BGM 三档，同上 */
  music: 0 | 1 | 2
  visible: boolean
  tick: number
  /** 小人刚碰了什么（世界给的台词），没有就显示默认提示 */
  note?: string
  onSpeed: () => void
  onPause: () => void
  onWeather: () => void
  onSeason: () => void
  onVolume: () => void
  onMusic: () => void
  onToggle: () => void
  /** 只有全屏模态才给退出键；首页标签里退出会杀掉常驻实例，所以留空 */
  onExit?: () => void
}

export function FarmHud(props: HudProps) {
  const { ms, kind, snap, manual, season, seasonAuto, speedIdx, paused, visible, tick } = props
  const d = new Date(ms)
  const hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
  const phase = phaseLabel(hour)
  const pulse = tick % 2 === 0
  const temp = snap?.temperatureC != null ? `${Math.round(snap.temperatureC)}°` : "--°"
  const sourceText =
    manual != null
      ? "手动预览"
      : snap == null
        ? "读取天气…"
        : snap.source === "live"
          ? "实时天气"
          : snap.source === "cache"
            ? "缓存天气"
            : "推算天气"

  if (!visible) {
    // 收起来之后只留一颗「叫回面板」的按钮。
    // 注意：VStack(alignment: trailing) 不会把子视图顶到右边（实测会居中），
    // 靠右必须用 HStack + Spacer + maxWidth infinity。
    return (
      <VStack
        spacing={0}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        padding={{ horizontal: 14, top: 14, bottom: 24 }}
      >
        <Spacer />
        <HStack frame={{ maxWidth: "infinity" }}>
          <Spacer />
          <Text
            font={{ name: "Menlo-Bold", size: 11 }}
            foregroundStyle={DIM}
            padding={{ horizontal: 11, vertical: 8 }}
            background={plate(9)}
            onTapGesture={props.onToggle}
          >
            {"▤ 面板"}
          </Text>
        </HStack>
      </VStack>
    )
  }

  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ horizontal: 16, top: 10, bottom: 12 }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    >
      <HStack alignment="top" spacing={10}>
        <VStack
          alignment="leading"
          spacing={3}
          padding={{ horizontal: 12, vertical: 9 }}
          background={plate(9)}
        >
          <HStack spacing={7} alignment="firstTextBaseline">
            <Text font={{ name: "Menlo-Bold", size: 30 }} foregroundStyle={INK}>
              {clockText(ms)}
            </Text>
            <Text font={{ name: "Menlo-Bold", size: 9 }} foregroundStyle={pulse ? GOLD : FAINT}>
              {"●"}
            </Text>
          </HStack>
          <Text font={{ name: "Menlo", size: 9 }} foregroundStyle={DIM}>
            {`${phase.zh} · ${phase.en}`}
          </Text>
          <Text font={{ name: "Menlo", size: 8 }} foregroundStyle={FAINT}>
            {`${d.getMonth() + 1}月${d.getDate()}日 · ${SEASON_ZH[season]}季 `}
          </Text>
        </VStack>

        <Spacer />

        <VStack
          alignment="trailing"
          spacing={4}
          padding={{ horizontal: 11, vertical: 9 }}
          background={plate(9)}
          onTapGesture={props.onWeather}
        >
          <Text font={{ name: "Menlo-Bold", size: 15 }} foregroundStyle={INK}>
            {`${WEATHER_ZH[kind]} ${temp}`}
          </Text>
          <Text font={{ name: "Menlo", size: 8 }} foregroundStyle={FAINT}>
            {`${WEATHER_EN[kind]} · ${sourceText}`}
          </Text>
        </VStack>
      </HStack>

      <Spacer />

      <VStack alignment="leading" spacing={9} frame={{ maxWidth: "infinity" }}>
        <HStack spacing={7}>
          <Chip
            label={`⏱ ${SPEED_LABEL[speedIdx]}`}
            active={speedIdx > 0}
            onTap={props.onSpeed}
          />
          <Chip label={paused ? "▶ 继续" : "⏸ 暂停"} active={paused} onTap={props.onPause} />
          <Chip
            label={`${SEASON_GLYPH[season]} ${SEASON_ZH[season]}`}
            active={!seasonAuto}
            onTap={props.onSeason}
          />
          <Chip label={VOL_LABEL[props.level]} active={props.level > 0} onTap={props.onVolume} />
          <Chip label={MUSIC_LABEL[props.music]} active={props.music > 0} onTap={props.onMusic} />
          <Spacer />
          <Chip label="◱ 收起" onTap={props.onToggle} />
        </HStack>

        <HStack spacing={6}>
          <Text
            font={{ name: "Menlo", size: 8 }}
            foregroundStyle={DIM}
            padding={{ horizontal: 8, vertical: 5 }}
            background={plate(9)}
          >
            {props.note && props.note.length > 0
              ? props.note
              : props.onExit == null
                ? `点一下地面 · 我就过去`
                : `点地面走过去 · 连点三下退出`}
          </Text>
          <Spacer />
          {props.onExit == null ? null : (
            <Text
              font={{ name: "Menlo-Bold", size: 9 }}
              foregroundStyle={GOLD}
              padding={{ horizontal: 9, vertical: 6 }}
              background={plate(7)}
              onTapGesture={props.onExit}
            >
              {"✕ 退出"}
            </Text>
          )}
        </HStack>
      </VStack>
    </VStack>
  )
}
