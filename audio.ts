/**
 * audio.ts — 把 amb.ts 算出来的声音放进 AVAudioEngine 里响
 *
 * 结构（每层独立，互不影响）：
 *   playerNode × 5 ─────► layerMixer × 5 ──┐
 *   playerNode × 3 ─────► sfxMixer   × 3 ──┴──► 主混音器 ──► 扬声器
 *
 * 几条心得（都是踩出来的）：
 *  - 会话用 ambient：静音键能静音、不打断别人在放的歌。壁纸不该抢主音频。
 *  - fromChannels 每次拷贝有 256KB 预算，8 秒的层塞不进去。
 *    所以先把 PCM 写成 WAV 落到 App Group 缓存，再用 AVAudioFile 读成原生 buffer ——
 *    这条路不进 JS 拷贝预算，还能顺手把合成结果缓存下来，第二次启动直接读盘。
 *  - playerNode 没有 setMixing，音量只能靠一个 mixer 节点做；player 直连主混音器会被换格式。
 *  - 图层懒加载 + 每拍最多建一层，避免开局卡一下。
 *  - 音量变化 80ms 一小步逼近，500ms 一步会听见台阶。
 *  - 所有图操作串在一条 promise 队列里，异步乱序会偶发挂。
 */
import {
  GEN,
  SFX_GEN,
  LAYERS,
  SR,
  type AmbMix,
  type AmbSeason,
  type AmbWeather,
  type LayerName,
  type SfxName,
  mixFor,
} from "./amb"
import { MUSIC_BARS, MUSIC_LEN, MUSIC_SR, finishMusic, renderMusicBars } from "./music"

/** 每层的固定增益：把「权重」翻译成「听感」。BGM 是主角，这一列是配角 */
const GAIN: Record<LayerName, number> = {
  wind: 0.4,
  birds: 0.34,
  crickets: 0.24,
  rain: 0.40,
  hush: 0.28,
}

/** 三档主音量，0 就是静音（引擎还在，只是全部淡下去） */
export const MASTER = [0, 0.5, 0.9]

/** 合成算法改了就升这个号，旧缓存自动作废 */
const CACHE_KEY = "amb-v3"

export type AudioLevel = 0 | 1 | 2

type Layer = {
  player: AVAudioPlayerNode | null
  mixer: AVAudioMixerNode | null
  buffer: AVAudioPCMBuffer | null
  cur: number
  want: number
  booting: boolean
  dead: boolean
}

const layers: Record<LayerName, Layer> = {
  wind: { player: null, mixer: null, buffer: null, cur: 0, want: 0, booting: false, dead: false },
  birds: { player: null, mixer: null, buffer: null, cur: 0, want: 0, booting: false, dead: false },
  crickets: { player: null, mixer: null, buffer: null, cur: 0, want: 0, booting: false, dead: false },
  rain: { player: null, mixer: null, buffer: null, cur: 0, want: 0, booting: false, dead: false },
  hush: { player: null, mixer: null, buffer: null, cur: 0, want: 0, booting: false, dead: false },
}

let format: AVAudioFormat | null = null
let engine: AVAudioEngine | null = null
let master: AVAudioMixerNode | null = null
type SfxSlot = { player: AVAudioPlayerNode; mixer: AVAudioMixerNode }
/** 每个音效自己的音量。脚步声要比其它都轻 —— 它是点缀，不是节拍器 */
const SFX_VOL: Record<SfxName, number> = {
  step: 0.26,
  splash: 0.46,
  cluck: 0.4,
  knock: 0.34,
  rustle: 0.3,
  thunder: 0.78,
}
let sfxNodes: (SfxSlot | null)[] = [null, null, null]
let sfxBuffers: Partial<Record<SfxName, AVAudioPCMBuffer>> = {}
let sfxTurn = 0

let starting = false
let ready = false
let failed = false
let level: AudioLevel = 1

/* 音乐是单独一条链：环境音归环境音，曲子归曲子，两边能各自关 */
type MusicSlot = { player: AVAudioPlayerNode; mixer: AVAudioMixerNode }
let musicSlot: MusicSlot | null = null
let musicBooting = false
let musicDead = false
/** BGM 的整体底噪：现在是主角了，压在环境音上面 */
const MUSIC_GAIN = 0.95
/** 音乐三档，0 就是「只要白噪音，别放曲」 */
export const MUSIC_MASTER = [0, 0.5, 1]
let musicLevel: AudioLevel = 1
let musicCur = 0
let musicWant = 0

let fadeTimer: ReturnType<typeof setTimeout> | null = null
/** 图操作串行队列 */
let queue: Promise<void> = Promise.resolve()

function serial(fn: () => Promise<void>): Promise<void> {
  const next = queue.then(fn, fn)
  queue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

function getFormat(): AVAudioFormat {
  if (!format) format = new AVAudioFormat({ sampleRate: SR, channelCount: 1, sampleType: "float32", interleaved: false })
  return format
}

/* ------------------------------------------------------------------ */
/* PCM → WAV 缓存 → 原生 buffer                                        */
/* ------------------------------------------------------------------ */

function encodeWav16(x: Float32Array, sr: number): Uint8Array {
  const n = x.length
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const tag = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  tag(0, "RIFF")
  v.setUint32(4, 36 + n * 2, true)
  tag(8, "WAVE")
  tag(12, "fmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  tag(36, "data")
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, x[i]))
    v.setInt16(44 + i * 2, Math.round(s * 32767), true)
  }
  return new Uint8Array(buf)
}

function cacheDir(): string {
  const dir = FileManager.appGroupDocumentsDirectory + "/" + CACHE_KEY
  if (!FileManager.existsSync(dir)) FileManager.createDirectorySync(dir, true)
  return dir
}

/** 合成 → 落盘（已有就跳过）→ 读成原生 buffer */
async function loadBuffer(id: string, gen: () => Float32Array): Promise<AVAudioPCMBuffer> {
  const path = cacheDir() + "/" + id + ".wav"
  if (!FileManager.existsSync(path)) {
    FileManager.writeAsBytesSync(path, encodeWav16(gen(), SR))
  }
  const file = await AVAudioFile.openForReading(path, { sampleType: "float32" })
  try {
    const st = await file.getState()
    const buf = await file.read(st.length)
    if (buf.frameLength === 0) throw new Error("empty buffer: " + id)
    return buf
  } finally {
    await file.close()
  }
}

/* ------------------------------------------------------------------ */
/* 生命周期                                                            */
/* ------------------------------------------------------------------ */

/** 起引擎。可重复调用；失败一次就不再折腾（壁纸不能因为这个黑屏） */
export function audioStart(): void {
  if (ready || starting || failed) return
  starting = true
  void serial(async () => {
    try {
      await SharedAudioSession.configure({ category: "ambient" })
      await SharedAudioSession.setActive(true)
      const eng = await AVAudioEngine.create()
      const mix = await eng.getMainMixerNode()
      await eng.prepare()
      await eng.start()
      engine = eng
      master = mix
      await mix.setOutputVolume(MASTER[level])
      ready = true
    } catch (e) {
      failed = true
      console.log("[audio] 引擎没起来：", String(e))
    } finally {
      starting = false
    }
  })
}

/** 退出/切走时收摊 */
export function audioStop(): void {
  stopFadeTimer()
  for (const name of LAYERS) {
    const l = layers[name]
    l.want = 0
    l.cur = 0
  }
  if (!ready || !engine) return
  void serial(async () => {
    try {
      for (const slot of sfxNodes) if (slot) await slot.player.stop()
      if (musicSlot) await musicSlot.player.stop()
      for (const name of LAYERS) {
        const l = layers[name]
        if (l.player) await l.player.stop()
      }
      await engine!.stop()
      await SharedAudioSession.setActive(false, ["notifyOthersOnDeactivation"])
    } catch (e) {
      console.log("[audio] 收摊出错：", String(e))
    } finally {
      ready = false
      engine = null
      master = null
      sfxNodes = [null, null, null]
      musicSlot = null
      musicCur = 0
      musicWant = 0
      for (const name of LAYERS) {
        const l = layers[name]
        l.player = null
        l.mixer = null
        l.buffer = null
      }
      starting = false
    }
  })
}

export function audioIsReady(): boolean {
  return ready
}

export function audioFailed(): boolean {
  return failed
}

/* ------------------------------------------------------------------ */
/* 音量档                                                              */
/* ------------------------------------------------------------------ */

export function getAudioLevel(): AudioLevel {
  return level
}

export function setAudioLevel(v: AudioLevel): void {
  level = v
  if (!ready || !master) return
  void serial(async () => {
    try {
      await master!.setOutputVolume(MASTER[level])
    } catch (e) {
      console.log("[audio] 主音量没设上：", String(e))
    }
  })
}

/** 圆点一点即换：静音 ↔ 低档 */
export function toggleMute(): AudioLevel {
  setAudioLevel(level === 0 ? 1 : 0)
  return level
}

/* ------------------------------------------------------------------ */
/* 音乐                                                                */
/* ------------------------------------------------------------------ */

export function getMusicLevel(): AudioLevel {
  return musicLevel
}

export function cycleMusic(): AudioLevel {
  musicLevel = ((musicLevel + 1) % 3) as AudioLevel
  return musicLevel
}

/** 曲子要多少音量（不包含淡变状态，淡变在 fadeTimer 里追） */
function musicTarget(hour: number, enabled: boolean): number {
  if (!enabled) return 0
  // 深夜自动再压一截：凌晨两点的农场比下午更像「打着盹」
  const night = hour >= 22 || hour < 6 ? 0.72 : 1
  return MUSIC_GAIN * MUSIC_MASTER[musicLevel] * night
}

/**
 * 建音乐链。第一次运行要现算 38 秒的曲子，所以分四段算、每段中间让出一帧，
 * 否则开局会卡两三秒。（之后从缓存读盘，几十毫秒。）
 */
async function bootMusic(): Promise<void> {
  if (musicDead || musicSlot || !engine || !master) return
  musicBooting = true
  try {
    const path = cacheDir() + "/music.wav"
    if (!FileManager.existsSync(path)) {
      const out = new Float32Array(MUSIC_LEN)
      for (let bar = 0; bar < MUSIC_BARS; bar += 4) {
        renderMusicBars(out, bar, Math.min(bar + 4, MUSIC_BARS))
        await new Promise<void>((r) => setTimeout(r, 16))
      }
      FileManager.writeAsBytesSync(path, encodeWav16(finishMusic(out), MUSIC_SR))
    }
    const file = await AVAudioFile.openForReading(path, { sampleType: "float32" })
    let buffer: AVAudioPCMBuffer
    try {
      const st = await file.getState()
      buffer = await file.read(st.length)
    } finally {
      await file.close()
    }
    if (buffer.frameLength === 0) throw new Error("empty music buffer")

    const player = await AVAudioPlayerNode.create()
    const mixer = await AVAudioMixerNode.create()
    await engine.attach(player)
    await engine.attach(mixer)
    await engine.connect(player, mixer, { toBus: 0, format: buffer.format })
    const bus = await master.getNextAvailableInputBus()
    await engine.connect(mixer, master, { toBus: bus })
    await mixer.setOutputVolume(0)
    await player.scheduleBuffer(buffer, { loops: true })
    await player.play()
    musicSlot = { player, mixer }
  } catch (e) {
    musicDead = true
    console.log("[audio] 音乐没建起来：", String(e))
  } finally {
    musicBooting = false
  }
}

/* ------------------------------------------------------------------ */
/* 每层的创建与推进                                                    */
/* ------------------------------------------------------------------ */

async function bootLayer(name: LayerName): Promise<void> {
  const l = layers[name]
  if (l.dead || l.player || !engine || !master) return
  l.booting = true
  try {
    const buffer = await loadBuffer(name, GEN[name])
    const player = await AVAudioPlayerNode.create()
    const mixer = await AVAudioMixerNode.create()
    await engine.attach(player)
    await engine.attach(mixer)
    await engine.connect(player, mixer, { toBus: 0, format: buffer.format })
    const bus = await master.getNextAvailableInputBus()
    await engine.connect(mixer, master, { toBus: bus })
    await mixer.setOutputVolume(0)
    await player.scheduleBuffer(buffer, { loops: true })
    await player.play()
    l.buffer = buffer
    l.player = player
    l.mixer = mixer
  } catch (e) {
    l.dead = true
    console.log("[audio] 图层 " + name + " 没建起来：", String(e))
  } finally {
    l.booting = false
  }
}

function applyLevels(): void {
  for (const name of LAYERS) {
    const l = layers[name]
    if (!l.mixer) continue
    const v = Math.max(0, Math.min(1, l.cur)) * GAIN[name]
    void l.mixer.setOutputVolume(v).catch(() => undefined)
  }
  if (musicSlot) void musicSlot.mixer.setOutputVolume(Math.max(0, Math.min(1, musicCur))).catch(() => undefined)
}

/** 80ms 一步把 cur 逼近 want；全部到位就自己停，不常驻 */
function startFadeTimer(): void {
  if (fadeTimer !== null) return
  const step = () => {
    let moving = false
    for (const name of LAYERS) {
      const l = layers[name]
      const d = l.want - l.cur
      if (Math.abs(d) < 0.004) {
        l.cur = l.want
        continue
      }
      l.cur += d * 0.18
      moving = true
    }
    // 曲子淡得比环境音慢（0.04/80ms，两三秒才淡进来），不会突然把人惊到
    const dm = musicWant - musicCur
    if (Math.abs(dm) < 0.004) musicCur = musicWant
    else {
      musicCur += dm * 0.04
      moving = true
    }
    applyLevels()
    if (moving) fadeTimer = setTimeout(step, 80)
    else fadeTimer = null
  }
  fadeTimer = setTimeout(step, 80)
}

function stopFadeTimer(): void {
  if (fadeTimer !== null) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
}

/**
 * 主循环每拍调一次：按时间/天气/季节算目标混音，顺手把还没建的层建起来
 * @param enabled 暂停或切走时传 false —— 全部淡到 0，但引擎不拆，回来立刻有声
 */
export function audioUpdate(hour: number, weather: AmbWeather, season: AmbSeason, enabled: boolean): void {
  if (!ready || failed) return
  const mix: AmbMix =
    enabled && level > 0 ? mixFor(hour, weather, season) : { wind: 0, birds: 0, crickets: 0, rain: 0, hush: 0 }

  // 一拍最多建一层，别在播放中卡住界面
  let booted = false
  for (const name of LAYERS) {
    const l = layers[name]
    l.want = mix[name]
    if (!booted && !l.player && !l.booting && !l.dead && l.want > 0.02) {
      booted = true
      void serial(() => bootLayer(name))
    }
  }

  musicWant = level > 0 ? musicTarget(hour, enabled) : 0
  // 环境音的那几层都就位了，再把曲子接上（建链要动引擎图，不想和图层抢）
  const pending = LAYERS.some((n) => {
    const l = layers[n]
    return l.want > 0.02 && !l.player && !l.dead
  })
  if (!pending && musicWant > 0.02 && !musicSlot && !musicBooting && !musicDead) {
    void serial(bootMusic)
  }

  startFadeTimer()
}

/** 让淡入淡出立刻重算（比如刚打开声音） */
export function audioNudge(): void {
  startFadeTimer()
}

/* ------------------------------------------------------------------ */
/* 一次性音效                                                          */
/* ------------------------------------------------------------------ */

export function playSfx(name: SfxName): void {
  if (!ready || failed || level === 0 || !engine || !master) return
  const idx = sfxTurn++ % sfxNodes.length
  void serial(async () => {
    try {
      let buf = sfxBuffers[name]
      if (!buf) {
        buf = await loadBuffer("sfx-" + name, SFX_GEN[name])
        sfxBuffers[name] = buf
      }
      // 节点第一次用的时候才建：每个槽位配一个自己的 mixer，跟图层一个待遇（直连共用的 mixer 会报 -10867）
      let slot = sfxNodes[idx]
      if (!slot) {
        const player = await AVAudioPlayerNode.create()
        const mixer = await AVAudioMixerNode.create()
        await engine!.attach(player)
        await engine!.attach(mixer)
        await engine!.connect(player, mixer, { toBus: 0, format: buf.format })
        const bus = await master!.getNextAvailableInputBus()
        await engine!.connect(mixer, master!, { toBus: bus })
        await mixer.setOutputVolume(1)
        slot = { player, mixer }
        sfxNodes[idx] = slot
      }
      await slot.mixer.setOutputVolume(SFX_VOL[name])
      await slot.player.scheduleBuffer(buf, { interrupts: true })
      await slot.player.play()
    } catch (e) {
      console.log("[audio] 音效 " + name + " 没响：", String(e))
    }
  })
}

/** 雨转雷雨那一下来一记，别敲着不放 */
export function playThunder(): void {
  playSfx("thunder")
}

/** 缓存目录（调试用） */
export function audioCachePath(): string {
  return cacheDir()
}

/** 状快照：排查“为什么没声”时看这个 */
export async function audioStatus(): Promise<string> {
  if (!ready || !engine) return failed ? "failed" : "idle"
  const st = await engine.getState()
  const parts: string[] = ["engine=" + st.state, "level=" + level]
  for (const name of LAYERS) {
    const l = layers[name]
    if (!l.player) {
      parts.push(name + ":-")
      continue
    }
    const on = await l.player.isPlaying()
    parts.push(name + "=" + (on ? "on" : "off") + "/" + l.cur.toFixed(2) + "->" + l.want.toFixed(2))
  }
  parts.push("sfx=" + sfxNodes.filter((s) => s !== null).length + "/3")
  parts.push("music=" + (musicSlot ? (await musicSlot.player.isPlaying() ? "on" : "off") : "-") + "/" + musicCur.toFixed(2) + "->" + musicWant.toFixed(2) + "@" + musicLevel)
  return parts.join(" ")
}
