/**
 * music.ts — 程序化 BGM（纯函数，不碰 AVAudio）
 *
 * 一首 38.4 秒、能无缝循环的「小农场日常曲」：C 大调、100 BPM、16 小节。
 * 编制全靠加法合成，没有半个采样：
 *   马林巴   —— 主旋律，颗粒清楚但不刺，走五声音阶，一听就是种田的调子
 *   拨弦     —— 八分音符分解和弦，音量压得很低，只负责「暖」
 *   正弦贝斯 —— 每小节根音 + 五度，把地板架住
 *   垫音     —— B 段才进来的一层气，几乎听不见，但一撤就空
 *   钟琴     —— 乐句收尾的「叮」，给安静留个句号
 *
 * 无缝循环的诀窍：所有音符的余响都不做截断，超出末尾就取模绕回开头；
 * 最后一个小节是主和弦，钟琴的尾巴正好落回第一小节的主和弦上，接缝听不出来。
 */

export const MUSIC_SR = 16000
export const MUSIC_BPM = 100
export const MUSIC_BARS = 16

const TAU = Math.PI * 2
const BEATS_PER_BAR = 4
/** 一拍几秒 */
const SPB = 60 / MUSIC_BPM
/** 整首多少帧（38.4s × 22050 = 846720，正好整数） */
export const MUSIC_LEN = Math.round(MUSIC_BARS * BEATS_PER_BAR * SPB * MUSIC_SR)

const freqOf = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

/**
 * 正弦直接用 Math.sin。试过查表加速，反而更慢（这台设备上 Float32 累加才是大头），
 * 所以真正的省时手段是：采样率降到 16k（最高泛音 5.6kHz，仍在奈奎斯特频率内）
 * + 每个音色只用最少几个泛音。
 */

/** 一个音色 = 若干个泛音，各自带自己的衰减倍率（数值越大衰得越快） */
type Harmonic = { ratio: number; gain: number; decay: number }

const MARIMBA: Harmonic[] = [
  { ratio: 1, gain: 1, decay: 1 },
  { ratio: 3.98, gain: 0.14, decay: 2.8 }, // 木头的「硬」在这里，量给大了就刺
]

const PLUCK: Harmonic[] = [
  { ratio: 1, gain: 1, decay: 1 },
  { ratio: 2, gain: 0.26, decay: 1.8 },
]

const BASS: Harmonic[] = [{ ratio: 1, gain: 1, decay: 0.8 }]

const BELL: Harmonic[] = [
  { ratio: 1, gain: 1, decay: 1 },
  { ratio: 2.76, gain: 0.26, decay: 2 },
]

/** 往缓冲区里叠一个音。startBeat 从整首的第 0 拍算起，越过末尾自动绕回开头 */
function voice(
  out: Float32Array,
  startBeat: number,
  beats: number,
  midi: number,
  amp: number,
  spec: Harmonic[],
  decay: number,
  attack: number,
) {
  const N = out.length
  const f = freqOf(midi)
  const start = Math.round(startBeat * SPB * MUSIC_SR)
  const body = beats * SPB
  // 余响最多再多给 2.2 个衰减常数，再长就糊成一团了
  const len = Math.round(Math.min(4.5, body + decay * 2.2) * MUSIC_SR)
  const atk = Math.max(1, attack * MUSIC_SR)
  // 提前把每个泛音的相位步长、衰减步长算好，内层循环只剩乘加
  const H = spec.length
  const w = new Float64Array(H)
  const ph = new Float64Array(H)
  const a0 = new Float64Array(H)
  const k = new Float64Array(H)
  for (let h = 0; h < H; h++) {
    w[h] = (TAU * f * spec[h].ratio) / MUSIC_SR
    a0[h] = spec[h].gain
    k[h] = Math.exp(-1 / ((decay / spec[h].decay) * MUSIC_SR))
  }
  let idx = start
  for (let j = 0; j < len; j++) {
    let v = 0
    for (let h = 0; h < H; h++) {
      v += a0[h] * Math.sin(ph[h])
      ph[h] += w[h]
      a0[h] *= k[h]
    }
    const g = j < atk ? j / atk : 1
    out[idx] += v * amp * g
    idx++
    if (idx === N) idx = 0
  }
}

/** 垫音：起得极慢、收得极慢的一层气，只求和声不要存在感 */
function pad(out: Float32Array, startBeat: number, beats: number, midis: number[], amp: number) {
  const N = out.length
  const start = Math.round(startBeat * SPB * MUSIC_SR)
  const body = beats * SPB
  const atk = 0.55
  const rel = 0.9
  const len = Math.round((body + rel) * MUSIC_SR)
  const per = amp / midis.length
  const ph = new Float64Array(midis.length)
  const w = new Float64Array(midis.length)
  for (let k = 0; k < midis.length; k++) w[k] = (TAU * freqOf(midis[k])) / MUSIC_SR
  let idx = start
  for (let j = 0; j < len; j++) {
    const t = j / MUSIC_SR
    let env = 1
    if (t < atk) env = t / atk
    else if (t > body) env = Math.max(0, 1 - (t - body) / rel)
    env *= 0.88 + 0.12 * Math.sin(TAU * 0.7 * t) // 一点点摇晃，别像合成器
    let v = 0
    for (let k = 0; k < midis.length; k++) v += Math.sin(ph[k])
    out[idx] += v * per * env
    for (let k = 0; k < midis.length; k++) ph[k] += w[k]
    idx++
    if (idx === N) idx = 0
  }
}

type Chord = { root: number; tones: number[] }

const C: Chord = { root: 48, tones: [60, 64, 67, 72] }
const G: Chord = { root: 43, tones: [59, 62, 67, 71] }
const Am: Chord = { root: 45, tones: [60, 64, 69, 72] }
const F: Chord = { root: 41, tones: [57, 60, 65, 69] }

/** A 段 C–G–Am–F / C–G–F–C，B 段 F–C–G–Am / F–G–C–C */
const PROG: Chord[] = [C, G, Am, F, C, G, F, C, F, C, G, Am, F, G, C, C]

/** 主旋律：[小节, 小节内第几拍, MIDI, 几拍长] */
const MELODY: [number, number, number, number][] = [
  // A 段：动机「A G E … A C」
  [0, 0, 81, 0.5], [0, 0.5, 79, 0.5], [0, 1, 76, 1], [0, 2, 79, 0.5], [0, 2.5, 81, 0.5], [0, 3, 84, 1],
  [1, 0, 74, 0.5], [1, 0.5, 76, 0.5], [1, 1, 79, 1], [1, 2, 81, 0.5], [1, 2.5, 79, 0.5], [1, 3, 74, 1],
  [2, 0, 84, 0.5], [2, 0.5, 81, 0.5], [2, 1, 76, 1], [2, 2, 81, 1], [2, 3, 79, 1],
  [3, 0, 81, 0.5], [3, 0.5, 79, 0.5], [3, 1, 76, 1], [3, 2, 74, 2],
  // 动机再来一遍，尾巴收住
  [4, 0, 81, 0.5], [4, 0.5, 79, 0.5], [4, 1, 76, 1], [4, 2, 81, 1], [4, 3, 76, 1],
  [5, 0, 74, 0.5], [5, 0.5, 76, 0.5], [5, 1, 79, 1], [5, 2, 81, 1], [5, 3, 79, 1],
  [6, 0, 76, 0.5], [6, 0.5, 74, 0.5], [6, 1, 72, 1], [6, 2, 74, 1], [6, 3, 76, 1],
  [7, 0, 72, 4],
  // B 段：抬一度，气口更长
  [8, 0, 84, 0.5], [8, 0.5, 81, 0.5], [8, 1, 77, 1], [8, 2, 81, 1], [8, 3, 79, 1],
  [9, 0, 76, 0.5], [9, 0.5, 79, 0.5], [9, 1, 84, 1], [9, 2, 81, 1], [9, 3, 79, 1],
  [10, 0, 74, 0.5], [10, 0.5, 76, 0.5], [10, 1, 79, 1], [10, 2, 83, 1], [10, 3, 81, 1],
  [11, 0, 81, 0.5], [11, 0.5, 84, 0.5], [11, 1, 81, 1], [11, 2, 76, 1], [11, 3, 72, 1],
  [12, 0, 81, 0.5], [12, 0.5, 79, 0.5], [12, 1, 81, 1], [12, 2, 84, 2],
  [13, 0, 83, 0.5], [13, 0.5, 81, 0.5], [13, 1, 79, 1], [13, 2, 74, 2],
  [14, 0, 76, 0.5], [14, 0.5, 79, 0.5], [14, 1, 81, 1], [14, 2, 79, 1], [14, 3, 76, 1],
  [15, 0, 72, 4],
]

/** 分解和弦的按弦顺序（指着 tones 的下标） */
const ARP = [0, 2, 1, 2, 3, 2, 1, 2]

/**
 * 只渲染 [fromBar, toBar) 这几小节，叠进 out。
 * 开局在手机上一次性算 38 秒会卡两三秒，所以拆成四段、每段之间让出一帧。
 */
export function renderMusicBars(out: Float32Array, fromBar: number, toBar: number): void {
  // 主旋律：马林巴，音量按音高微微一让，高的稍轻一点
  for (const [bar, beat, midi, beats] of MELODY) {
    if (bar < fromBar || bar >= toBar) continue
    const amp = midi >= 84 ? 0.4 : 0.46
    voice(out, bar * BEATS_PER_BAR + beat, beats, midi, amp, MARIMBA, 0.52, 0.012)
  }

  for (let bar = fromBar; bar < toBar; bar++) {
    const ch = PROG[bar]
    const base = bar * BEATS_PER_BAR

    // 拨弦伴奏：八分音符，第一拍重一点，整条线压在主旋律下面
    for (let i = 0; i < ARP.length; i++) {
      const midi = ch.tones[ARP[i]]
      const amp = 0.115 * (i === 0 ? 1 : i === 4 ? 0.88 : 0.76)
      voice(out, base + i * 0.5, 0.5, midi, amp, PLUCK, 0.42, 0.008)
    }

    // 贝斯：根音两拍 + 五度两拍
    voice(out, base, 2, ch.root, 0.28, BASS, 0.7, 0.02)
    voice(out, base + 2, 2, ch.root + 7, 0.22, BASS, 0.7, 0.02)

    // 垫音只在 B 段出现 —— 一进 B 段整个世界就暖起来了
    if (bar >= 8) pad(out, base, 4, [ch.tones[0] - 12, ch.tones[1] - 12, ch.tones[2] - 12], 0.05)
  }

  // 两个句尾的钟琴：A 段结束落三音，整首结束落主音，余响绕回开头
  const bells: [number, number, number, number][] = [
    [7, 2.5, 88, 0.2],
    [15, 2, 84, 0.19],
  ]
  for (const [bar, beat, midi, amp] of bells) {
    if (bar < fromBar || bar >= toBar) continue
    voice(out, bar * BEATS_PER_BAR + beat, 1, midi, amp, BELL, 1.15, 0.006)
  }
}

/** 全部段叠完后做一次归一：按 RMS 定基准（BGM 要比环境音小半截），再给峰值留余量 */
export function finishMusic(out: Float32Array): Float32Array {
  let sum = 0
  let peak = 0
  for (let i = 0; i < out.length; i++) {
    const v = out[i]
    sum += v * v
    const a = v < 0 ? -v : v
    if (a > peak) peak = a
  }
  const rms = Math.sqrt(sum / out.length)
  let gain = rms > 1e-6 ? 0.075 / rms : 1
  if (peak * gain > 0.62) gain = 0.62 / peak
  for (let i = 0; i < out.length; i++) out[i] *= gain
  return out
}

/** 一次算完（调试/导出用；播放路径用分段渲染，免得卡 UI） */
export function musicLoop(): Float32Array {
  const out = new Float32Array(MUSIC_LEN)
  renderMusicBars(out, 0, MUSIC_BARS)
  return finishMusic(out)
}
