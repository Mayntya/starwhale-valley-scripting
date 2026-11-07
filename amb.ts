/**
 * amb.ts — 环境音合成（纯函数，不碰 AVAudio）
 *
 * 这个项目连声音都不带素材：全部当场算出来。
 * 五个能无缝循环的「层」+ 六个一次性音效，全是 Float32Array，
 * 采样率 22050、单声道 —— 配像素画够了，内存也省。
 *
 * 无缝循环的三条规矩（踩过坑）：
 *  1. 噪声类不能直接截断，得上交叉淡化，否则每圈「啪」一下；
 *  2. 滤波器要先跑一段「热身」再取数，否则开头从 0 爬上来，像漏气；
 *  3. 所有 LFO 频率必须是循环周期的整数倍，尾巴和头才对得上。
 */

export const SR = 22050

const TAU = Math.PI * 2

/** xorshift32：要确定性，每次生成的雨都得是同一场雨 */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

function rmsOf(x: Float32Array): number {
  let sum = 0
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i]
  return Math.sqrt(sum / x.length)
}

/** 按 RMS 归一：五层的响度基准一致，混音就只剩「谁该响一点」这条线 */
function normalize(x: Float32Array, target: number): Float32Array {
  const r = rmsOf(x)
  if (r > 1e-6) {
    const k = target / r
    for (let i = 0; i < x.length; i++) x[i] *= k
  }
  return clip(x, 0.98)
}

/** 一次性音效按峰值归一，免得雷鸣被 RMS 算成蚊子叫 */
function normalizePeak(x: Float32Array, peak: number): Float32Array {
  let m = 0
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]))
  if (m > 1e-6) {
    const k = peak / m
    for (let i = 0; i < x.length; i++) x[i] *= k
  }
  return edgeFade(clip(x, 0.99), 0.0015, 0.006)
}

/** 两头各抹掉几毫秒：一次性音效要“从无到无”，不然起停那一下是咔嗒声 */
function edgeFade(x: Float32Array, inSec: number, outSec: number): Float32Array {
  const a = Math.max(1, Math.round(inSec * SR))
  const b = Math.max(1, Math.round(outSec * SR))
  const n = x.length
  for (let i = 0; i < Math.min(a, n); i++) x[i] *= i / a
  for (let i = 0; i < Math.min(b, n); i++) x[n - 1 - i] *= i / b
  return x
}

function clip(x: Float32Array, limit: number): Float32Array {
  let touched = false
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > limit) touched = true
  if (!touched) return x
  for (let i = 0; i < x.length; i++) {
    const v = x[i] / limit
    x[i] = limit * (v / (1 + Math.abs(v) * 0.35))
  }
  return x
}

/**
 * 把「多算了 fade 个样本」的长条交叉淡化成正好 n 个样本的循环。
 * src[n..] 是 src[0..] 的自然延续，所以淡完接缝处几乎等于什么都没发生。
 */
function loopMix(src: Float32Array, n: number, fade: number): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = src[i]
  for (let i = 0; i < fade; i++) {
    const a = i / fade // 头：由 0 爬到 1
    out[i] = src[i] * a + src[n + i] * (1 - a)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 五层环境音                                                          */
/* ------------------------------------------------------------------ */

/** 风：棕色噪声 → 三级低通 → 两个正弦阵风。晴天很轻，雷雨会重 */
export function wind(): Float32Array {
  const n = Math.round(8 * SR)
  const fade = Math.round(0.5 * SR)
  const warm = SR * 2 // 热身，不进结果
  const r = rng(0x51ed)
  const raw = new Float32Array(n + fade)
  let b = 0
  let l1 = 0
  let l2 = 0
  let l3 = 0
  for (let i = -warm; i < n + fade; i++) {
    const w = r() * 2 - 1
    b = (b + 0.018 * w) / 1.018
    l1 += 0.09 * (b - l1)
    l2 += 0.035 * (l1 - l2)
    l3 += 0.012 * (l2 - l3)
    if (i < 0) continue
    const u = (i % n) / n
    const gust = 0.5 + 0.5 * Math.sin(TAU * 2 * u + 0.4) * (0.65 + 0.35 * Math.sin(TAU * 5 * u))
    raw[i] = l3 * gust
  }
  return normalize(loopMix(raw, n, fade), 0.085)
}

/** 雨：高通嘶声 + 中频雨幕 + 每秒四十来颗雨点砸在叶子上的「嗒」 */
export function rain(): Float32Array {
  const n = Math.round(8 * SR)
  const fade = Math.round(0.35 * SR)
  const warm = SR
  const r = rng(0x7a13)
  const raw = new Float32Array(n + fade)
  let lp = 0
  let lp2 = 0
  for (let i = -warm; i < n + fade; i++) {
    const w = r() * 2 - 1
    lp += 0.55 * (w - lp)
    lp2 += 0.055 * (w - lp2)
    if (i < 0) continue
    const hiss = w - lp
    const body = lp - lp2
    const gust = 0.85 + 0.15 * Math.sin(TAU * 3 * ((i % n) / n))
    raw[i] = (hiss * 0.8 + body * 1.5) * gust
  }
  // 雨点：短、亮、带个小尾巴，比单纯白噪声更像「下雨」而不是「沙沙」
  const drops = 8 * 42
  for (let k = 0; k < drops; k++) {
    const at = Math.floor(r() * (n - 400))
    const f = 1900 + r() * 3200
    const amp = 0.045 + r() * 0.1
    const len = Math.round(SR * (0.003 + r() * 0.005))
    for (let j = 0; j < len; j++) {
      const e = Math.exp(-j / (len * 0.34))
      raw[at + j] += Math.sin((TAU * f * j) / SR) * amp * e
    }
  }
  return normalize(loopMix(raw, n, fade), 0.115)
}

/** 雪/雾：更低更闷的一层底噪，两拍一次的缓慢起伏。它不是「声音」，是「安静的形状」 */
export function hush(): Float32Array {
  const n = Math.round(8 * SR)
  const fade = Math.round(0.6 * SR)
  const warm = SR * 3
  const r = rng(0x2b71)
  const raw = new Float32Array(n + fade)
  let l1 = 0
  let l2 = 0
  let l3 = 0
  for (let i = -warm; i < n + fade; i++) {
    const w = r() * 2 - 1
    // 三级一阶低通：截止约 400 / 130 / 50Hz，-18dB/oct 把「嘶」压掉，只留一口气
    l1 += 0.055 * (w - l1)
    l2 += 0.018 * (l1 - l2)
    l3 += 0.007 * (l2 - l3)
    if (i < 0) continue
    const u = (i % n) / n
    const swell = 0.34 + 0.66 * (0.5 + 0.5 * Math.sin(TAU * 2 * u - 1.1))
    raw[i] = (l2 * 0.9 + l3 * 2.2) * swell
  }
  return normalize(loopMix(raw, n, fade), 0.06)
}

/** 鸟：一簇一簇的短促滑音，带一点泛音和更远的一声回声 */
export function birds(): Float32Array {
  const dur = 12
  const out = new Float32Array(Math.round(dur * SR))
  const r = rng(0x9c35)
  const N = out.length

  const chirp = (t0: number, f0: number, f1: number, len: number, amp: number, harm: number) => {
    const start = Math.floor(t0 * SR)
    const count = Math.floor(len * SR)
    let ph = 0
    let ph2 = 0
    for (let j = 0; j < count; j++) {
      const u = j / count
      const f = f0 + (f1 - f0) * u
      ph += (TAU * f) / SR
      ph2 += (TAU * f * 1.87) / SR
      const e = Math.min(1, j / (SR * 0.006)) * Math.exp(-3.1 * u) * amp
      const i = start + j
      if (i >= 0 && i < N) out[i] += (Math.sin(ph) + harm * Math.sin(ph2)) * e
    }
  }

  // 12 秒里撒几簇鸟叫，每簇 1-3 声；头尾留白，循环处本来就是静的
  let t = 0.3
  while (t < dur - 1.8) {
    const bunch = 1 + Math.floor(r() * 3)
    const base = 2150 + r() * 950
    const down = r() < 0.3
    for (let b = 0; b < bunch; b++) {
      const f1 = down ? base - 850 : base + 1150
      chirp(t + b * (0.13 + r() * 0.07), base, f1, 0.065 + r() * 0.06, 0.55, 0.32)
    }
    // 回声：稍晚、更轻、低一点，像山谷里那一面墙
    chirp(t + 0.17 + r() * 0.08, base * 0.97, base * 1.08, 0.085, 0.11, 0.25)
    t += 1.15 + r() * 1.5
  }
  return normalize(out, 0.055)
}

/** 虫：两条蟋蟀错拍，几乎纯音的三连脉冲。夏天夜里最响，冬天一只都没有 */
export function crickets(): Float32Array {
  const out = new Float32Array(Math.round(6 * SR))
  const r = rng(0x4d21)
  const N = out.length

  const burst = (t0: number, f: number, amp: number) => {
    for (let p = 0; p < 3; p++) {
      const s = Math.floor((t0 + p * 0.055) * SR)
      const count = Math.floor(0.026 * SR)
      for (let j = 0; j < count; j++) {
        const e = Math.min(1, j / (SR * 0.002)) * Math.exp(-j / (count * 0.42))
        const i = s + j
        if (i >= 0 && i < N) out[i] += Math.sin((TAU * f * j) / SR) * amp * e
      }
    }
  }

  // 6 秒 15 叫，正好卡在 0.4s 一格上，循环处节奏不断
  for (let k = 0; k < 15; k++) {
    burst(k * 0.4, 4390 + r() * 110, 0.5)
    burst(k * 0.4 + 0.21, 3940 + r() * 90, 0.3)
  }
  return normalize(out, 0.05)
}

/* ------------------------------------------------------------------ */
/* 一次性音效                                                          */
/* ------------------------------------------------------------------ */

/** 脚步：一个 95Hz 的低频顿 + 一小撮摩擦，踩在土地上就是这种闷响 */
export function step(): Float32Array {
  const out = new Float32Array(Math.round(0.13 * SR))
  const r = rng(0x31a7)
  const N = out.length
  let lp = 0
  for (let i = 0; i < N; i++) {
    const t = i / SR
    const w = r() * 2 - 1
    lp += 0.25 * (w - lp)
    const thump = Math.sin(TAU * 95 * t) * Math.exp(-t * 36)
    const grit = lp * Math.exp(-t * 62)
    out[i] = thump * 0.5 + grit * 1.15
  }
  return normalizePeak(out, 0.42)
}

/** 涟漪：一捧水声 + 三个气泡，气泡音高往上走，像水面张力崩掉那一下 */
export function splash(): Float32Array {
  const out = new Float32Array(Math.round(0.5 * SR))
  const r = rng(0x7b31)
  const N = out.length
  let lp = 0
  for (let i = 0; i < N; i++) {
    const t = i / SR
    const w = r() * 2 - 1
    lp += 0.6 * (w - lp)
    out[i] = (w - lp) * Math.exp(-t * 22) * 1.1
  }
  const bubbles: [number, number, number][] = [
    [0.055, 780, 0.5],
    [0.145, 1120, 0.36],
    [0.255, 900, 0.24],
  ]
  for (const [at, f0, amp] of bubbles) {
    const s = Math.floor(at * SR)
    const count = Math.floor(0.05 * SR)
    let ph = 0
    for (let j = 0; j < count; j++) {
      const u = j / count
      ph += (TAU * (f0 * (1 + 0.6 * u))) / SR
      const e = Math.min(1, j / (SR * 0.003)) * Math.exp(-3 * u) * amp
      if (s + j < N) out[s + j] += Math.sin(ph) * e
    }
  }
  return normalizePeak(out, 0.45)
}

/** 鸡叫：两短声，带二三次谐波的「咯咯」，最后咽回去 */
export function cluck(): Float32Array {
  const out = new Float32Array(Math.round(0.42 * SR))
  const N = out.length
  const voice = (t0: number, f0: number, f1: number, amp: number) => {
    const s = Math.floor(t0 * SR)
    const count = Math.floor(0.095 * SR)
    let ph = 0
    for (let j = 0; j < count; j++) {
      const u = j / count
      ph += (TAU * (f0 + (f1 - f0) * u)) / SR
      const e = Math.min(1, j / (SR * 0.004)) * Math.exp(-3.4 * u) * amp
      if (s + j < N) {
        out[s + j] += (Math.sin(ph) + 0.42 * Math.sin(2 * ph) + 0.18 * Math.sin(3 * ph)) * e
      }
    }
  }
  voice(0.012, 730, 520, 0.6)
  voice(0.165, 650, 455, 0.4)
  return normalizePeak(out, 0.4)
}

/** 敲门/木响：给农舍和稻草人用，一把干木头 */
export function knock(): Float32Array {
  const out = new Float32Array(Math.round(0.22 * SR))
  const r = rng(0x5c11)
  const N = out.length
  let lp = 0
  for (let i = 0; i < N; i++) {
    const t = i / SR
    const w = r() * 2 - 1
    lp += 0.35 * (w - lp)
    const body = Math.sin(TAU * 220 * t) * Math.exp(-t * 42)
    const crack = lp * Math.exp(-t * 120)
    out[i] = body * 0.6 + crack * 0.9
  }
  return normalizePeak(out, 0.38)
}

/** 树摇/草叶：四下断续的沙沙，像有东西从枝叶里被抖出去 */
export function rustle(): Float32Array {
  const out = new Float32Array(Math.round(0.65 * SR))
  const r = rng(0x2f9b)
  const N = out.length
  let lp = 0
  let lp2 = 0
  for (let i = 0; i < N; i++) {
    const t = i / SR
    const w = r() * 2 - 1
    lp += 0.45 * (w - lp)
    lp2 += 0.12 * (w - lp2)
    const band = lp - lp2
    const env =
      Math.exp(-Math.pow((t - 0.03) * 22, 2)) +
      0.7 * Math.exp(-Math.pow((t - 0.17) * 26, 2)) +
      0.45 * Math.exp(-Math.pow((t - 0.33) * 30, 2)) +
      0.25 * Math.exp(-Math.pow((t - 0.47) * 34, 2))
    out[i] = band * env * 2.4
  }
  return normalizePeak(out, 0.34)
}

/** 雷：远雷，不是炸雷。几个鼓包从低到高滚过去，尾巴拉长 */
export function thunder(): Float32Array {
  const out = new Float32Array(Math.round(5 * SR))
  const r = rng(0x11e7)
  const N = out.length
  let b = 0
  let l1 = 0
  let l2 = 0
  let l3 = 0
  const bumps: [number, number][] = [
    [0.05, 1],
    [0.75, 0.62],
    [1.85, 0.4],
    [3.2, 0.2],
  ]
  for (let i = 0; i < N; i++) {
    const t = i / SR
    const w = r() * 2 - 1
    b = (b + 0.05 * w) / 1.05
    l1 += 0.02 * (b - l1)
    l2 += 0.006 * (l1 - l2)
    l3 += 0.0022 * (l2 - l3)
    let env = 0
    for (const [at, amp] of bumps) {
      const d = t - at
      if (d > 0) env += amp * Math.exp(-d * 1.4)
    }
    out[i] = l3 * env
  }
  return normalizePeak(out, 0.72)
}

/* ------------------------------------------------------------------ */
/* 混音表：什么时刻、什么天气，哪一层该响                              */
/* ------------------------------------------------------------------ */

export type AmbMix = {
  wind: number
  birds: number
  crickets: number
  rain: number
  hush: number
}

export type AmbWeather = "clear" | "cloudy" | "rain" | "storm" | "snow" | "fog"
export type AmbSeason = "spring" | "summer" | "autumn" | "winter"

/** 白天程度：6 点醒、18 点困，两头各留两小时过渡 */
function daylight(hour: number): number {
  if (hour < 4 || hour > 21) return 0
  if (hour < 7) return (hour - 4) / 3
  if (hour > 18) return (21 - hour) / 3
  return 1
}

const BIRD_SEASON: Record<AmbSeason, number> = { spring: 1, summer: 0.85, autumn: 0.5, winter: 0.18 }
const CRICKET_SEASON: Record<AmbSeason, number> = { spring: 0.55, summer: 1, autumn: 0.8, winter: 0 }

/**
 * 输出的是「层权重」，不是最终音量 —— 真实音量 = 权重 × 层增益 × 主音量。
 * 想整体调小就动 audio.ts 里的 GAIN，想改口味就动这里。
 */
export function mixFor(hour: number, weather: AmbWeather, season: AmbSeason): AmbMix {
  const day = daylight(hour)
  const night = 1 - day

  // 天气会压掉「能听见小鸟」这件事：下雨天鸟是不叫的
  const openAir = weather === "clear" ? 1 : weather === "cloudy" ? 0.75 : weather === "fog" ? 0.5 : 0.12
  const wet = weather === "rain" ? 0.85 : weather === "storm" ? 1 : 0
  const still = weather === "snow" ? 0.5 : weather === "fog" ? 0.32 : 0

  const windPush =
    (weather === "storm" ? 0.42 : weather === "cloudy" ? 0.14 : weather === "snow" ? 0.16 : weather === "rain" ? 0.1 : 0) +
    (season === "winter" ? 0.14 : 0)

  return {
    wind: 0.34 + windPush,
    birds: day * openAir * (0.55 + 0.45 * BIRD_SEASON[season]),
    crickets: night * (weather === "clear" || weather === "fog" ? 1 : 0.45) * (0.35 + 0.65 * CRICKET_SEASON[season]),
    rain: wet,
    hush: still,
  }
}

/** 五层的名字和生成器，顺序即创建顺序 */
export const LAYERS = ["wind", "birds", "crickets", "rain", "hush"] as const
export type LayerName = (typeof LAYERS)[number]

export const GEN: Record<LayerName, () => Float32Array> = {
  wind,
  birds,
  crickets,
  rain,
  hush,
}

/** 一次性音效 */
export const SFX = ["step", "splash", "cluck", "knock", "rustle", "thunder"] as const
export type SfxName = (typeof SFX)[number]

export const SFX_GEN: Record<SfxName, () => Float32Array> = {
  step,
  splash,
  cluck,
  knock,
  rustle,
  thunder,
}
