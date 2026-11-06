/**
 * weather.ts — 天气层
 *
 * 只做一件事：把 WeatherKit 的 32 种 condition 收敛成 theme.ts 认识的那 6 个
 * WeatherKind，再顺手带上「本地小时数」和温度，供 paletteAt / gradePalette 直接使用。
 *
 * 约定：
 * - readWeather() 永不 reject：没网、没定位、超时都退化成 fallback 快照，壁纸不白屏；
 * - WeatherKind 从 theme.ts 引入，不在这里另立一份真值；
 * - 结果按坐标缓存 10 分钟，同一帧里重复调用不会重复打 WeatherKit；
 * - 传了坐标就不碰定位权限；没传才走 Location，且只用缓存定位，不强制请求。
 */

import type { WeatherKind } from "./theme"

export type { WeatherKind }

export const CACHE_TTL_MS = 10 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 15000

export type WeatherSource = "live" | "cache" | "fallback"

export type WeatherSnapshot = {
  /** 给 theme.gradePalette 用 */
  kind: WeatherKind
  /** 本地小时数（含小数，如 21.52），可直接喂 theme.paletteAt */
  hour: number
  /** 摄氏度；fallback 时拿不到就是 null */
  temperatureC: number | null
  isDaylight: boolean
  condition: WeatherCondition | "unknown"
  source: WeatherSource
  fetchedAt: number
  /** 仅 source === "fallback" 时存在 */
  error?: string
}

export type ReadWeatherOptions = {
  /** 传了坐标就不申请定位 */
  latitude?: number
  longitude?: number
  /** 跳过缓存强制拉一次 */
  force?: boolean
  ttlMs?: number
  timeoutMs?: number
}

const KIND_BY_CONDITION: Partial<Record<WeatherCondition, WeatherKind>> = {
  clear: "clear",
  mostlyClear: "clear",
  hot: "clear",
  frigid: "clear",

  partlyCloudy: "cloudy",
  mostlyCloudy: "cloudy",
  cloudy: "cloudy",
  breezy: "cloudy",
  windy: "cloudy",
  blowingDust: "cloudy",
  smoky: "cloudy",

  foggy: "fog",
  haze: "fog",

  drizzle: "rain",
  freezingDrizzle: "rain",
  rain: "rain",
  heavyRain: "rain",
  sunShowers: "rain",
  freezingRain: "rain",
  hail: "rain",
  wintryMix: "rain",
  sleet: "rain",

  thunderstorms: "storm",
  isolatedThunderstorms: "storm",
  scatteredThunderstorms: "storm",
  strongStorms: "storm",
  tropicalStorm: "storm",
  hurricane: "storm",

  snow: "snow",
  heavySnow: "snow",
  flurries: "snow",
  sunFlurries: "snow",
  blowingSnow: "snow",
  blizzard: "snow",
}

/** 未知 condition 当多云处理：压一点色，但不至于像暴风雨 */
export function kindOf(condition: string): WeatherKind {
  return KIND_BY_CONDITION[condition as WeatherCondition] ?? "cloudy"
}

/** 本地小时数，保留小数（paletteAt 靠它做关键帧插值） */
export function hourOf(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
}

const cache = new Map<string, WeatherSnapshot>()

function cacheKey(latitude?: number, longitude?: number): string {
  if (latitude == null || longitude == null) return "auto"
  return `${latitude.toFixed(3)},${longitude.toFixed(3)}`
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时（${ms}ms）`)), ms)
    p.then(
      v => {
        clearTimeout(timer)
        resolve(v)
      },
      e => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 失败也要给一张能看的画面，所以兜底用 clear，而不是把画面压成灰色 */
function fallbackSnapshot(at: number, error: string): WeatherSnapshot {
  const date = new Date(at)
  return {
    kind: "clear",
    hour: hourOf(date),
    temperatureC: null,
    isDaylight: date.getHours() >= 7 && date.getHours() < 19,
    condition: "unknown",
    source: "fallback",
    fetchedAt: at,
    error,
  }
}

export function clearWeatherCache(): void {
  cache.clear()
}

export async function readWeather(options: ReadWeatherOptions = {}): Promise<WeatherSnapshot> {
  const now = Date.now()
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const key = cacheKey(options.latitude, options.longitude)

  const hit = cache.get(key)
  if (!options.force && hit && now - hit.fetchedAt < (options.ttlMs ?? CACHE_TTL_MS)) {
    // 命中缓存时 hour 也要跟着走：过一小时再用不该还是旧时段
    return { ...hit, hour: hourOf(new Date(now)), source: "cache" }
  }

  try {
    const location: LocationInfo =
      options.latitude != null && options.longitude != null
        ? { latitude: options.latitude, longitude: options.longitude, timestamp: now }
        : await withTimeout(Location.requestCurrent({ forceRequest: false }), timeout, "定位").then(loc => {
            if (!loc) throw new Error("拿不到定位（无缓存坐标且未授权）")
            return loc
          })

    const current = await withTimeout(Weather.requestCurrent(location), timeout, "天气")

    const snapshot: WeatherSnapshot = {
      kind: kindOf(current.condition),
      hour: hourOf(new Date(now)),
      temperatureC: current.temperature.value,
      isDaylight: current.isDaylight,
      condition: current.condition,
      source: "live",
      fetchedAt: now,
    }
    cache.set(key, snapshot)
    return snapshot
  } catch (err) {
    return fallbackSnapshot(now, messageOf(err))
  }
}
