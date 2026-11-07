/**
 * player.ts — 住进农场的那个小人
 *
 * 只管状态和逻辑：她在哪、往哪走、刚才碰了什么。
 * 画法在 world.ts 里（那边才有画笔和调色板），坐标与世界共用 80 × 170。
 *
 * 时间一律用画布给的相对秒（frame.t），不用 Date.now()：
 * 这样暂停、切标签、恢复之后动作不会突然跳一大步。
 */

export type SpotId = "field" | "scarecrow" | "pond" | "tree" | "house" | "prop" | "chicken"

export type Player = {
  x: number
  y: number
  tx: number
  ty: number
  /** 朝向：1 向右，-1 向左 */
  face: 1 | -1
  moving: boolean
  /** 走路/待机的相位，画腿和尾巴都靠它 */
  step: number
  /** 当前正在做的碰触反应 */
  reactKind: SpotId | ""
  reactT0: number
  reactDur: number
  /** 反应冷却，免得站在田边反复触发 */
  cool: number
  /** 屏幕下方那行小字 */
  note: string
  noteUntil: number
  /** 已经过期并清过的 note（给 HUD 读，避免 HUD 自己算时间） */
  liveNote: string
}

const SPAWN = { x: 21, y: 148 }

export const player: Player = {
  x: SPAWN.x,
  y: SPAWN.y,
  tx: SPAWN.x,
  ty: SPAWN.y,
  face: 1,
  moving: false,
  step: 0,
  reactKind: "",
  reactT0: 0,
  reactDur: 2.4,
  cool: 0,
  note: "",
  noteUntil: 0,
  liveNote: "",
}

/** 能站的地方：地面区域，不许飞到天上去 */
const MIN_X = -10
const MAX_X = 90
const MIN_Y = 112
const MAX_Y = 166

/** 走速，世界单位/秒。世界 80 宽 ≈ 一块屏幕，26 大约是「不慌不忙」 */
const SPEED = 26

export function moveTo(x: number, y: number) {
  player.tx = Math.min(MAX_X, Math.max(MIN_X, x))
  player.ty = Math.min(MAX_Y, Math.max(MIN_Y, y))
}

export function say(text: string, now: number, dur = 3.2) {
  player.note = text
  player.noteUntil = now + dur
}

/** 触发一次碰触反应；返回是否真的触发（冷却中则为 false） */
export function react(id: SpotId, now: number, text: string, dur = 2.6): boolean {
  if (player.cool > 0) return false
  player.reactKind = id
  player.reactT0 = now
  player.reactDur = dur
  player.cool = 4
  say(text, now)
  return true
}

/**
 * 某个反应还剩多少「劲」：刚触发是 1，结束是 0，没在反应也是 0。
 * 画点头、涟漪、摇树都用它。
 */
export function pulse(id: SpotId, now: number): number {
  if (player.reactKind !== id) return 0
  const k = (now - player.reactT0) / player.reactDur
  return k >= 1 ? 0 : 1 - k
}

/* ------------------------------------------------------------------ */
/* 脚步声                                                              */
/* ------------------------------------------------------------------ */

let stepHook: (() => void) | null = null

/** 每迈一步叫一次（传 null 关掉）；player 自己不碰音频，音频那边接这个 */
export function onFootstep(fn: (() => void) | null) {
  stepHook = fn
}

export function updatePlayer(dt: number, now: number) {
  const p = player
  const dx = p.tx - p.x
  const dy = p.ty - p.y
  const d = Math.hypot(dx, dy)

  if (d > 0.4) {
    const step = Math.min(d, SPEED * dt)
    p.x += (dx / d) * step
    p.y += (dy / d) * step
    p.moving = true
    const before = Math.floor(p.step / Math.PI)
    p.step += dt * 8.5
    // sin(step) 每过 π 落一次脚，步频跟腿摆完全同步
    if (stepHook && Math.floor(p.step / Math.PI) !== before) stepHook()
    if (Math.abs(dx) > 0.3) p.face = dx > 0 ? 1 : -1
  } else {
    if (p.moving) {
      // 落脚的最后一小步，让脸转向方才去的方向
      p.moving = false
    }
    p.step += dt * 1.5
  }

  if (p.cool > 0) p.cool = Math.max(0, p.cool - dt)
  if (p.reactKind !== "" && now - p.reactT0 > p.reactDur) p.reactKind = ""

  // HUD 每半秒重绘一次，直接从这儿读已经算好的结果
  p.liveNote = now < p.noteUntil ? p.note : ""
}

export function resetPlayer() {
  player.x = SPAWN.x
  player.y = SPAWN.y
  player.tx = SPAWN.x
  player.ty = SPAWN.y
  player.moving = false
  player.reactKind = ""
  player.note = ""
  player.liveNote = ""
  player.noteUntil = 0
  player.cool = 0
}
