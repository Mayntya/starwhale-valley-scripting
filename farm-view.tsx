/**
 * farm-view.tsx — 壁纸本体：一层 Canvas + 一层面板
 *
 * 同一份视图同时服务两个宿主：
 *  - screen.tsx（全屏模态，onExit 有值 → 能退出）
 *  - home_screen_default_ui.tsx（首页标签，onExit 为空 → 不提供退出，退出会杀掉常驻实例）
 */

import { ZStack, TimelineCanvas, Script, useState, useEffect, useRef } from "scripting"
import { drawFrame, onSpotTouch, tapToWorld } from "./world"
import { FarmHud, SPEEDS } from "./hud"
import { moveTo, onFootstep, player, type SpotId } from "./player"
import type { WeatherKind } from "./theme"
import { readWeather, type WeatherSnapshot } from "./weather"
import { SEASONS, seasonOf, type Season } from "./season"
import type { SfxName } from "./amb"
import {
  audioStart,
  audioStop,
  audioUpdate,
  getAudioLevel,
  playSfx,
  playThunder,
  setAudioLevel,
  type AudioLevel,
} from "./audio"

const WEATHER_CYCLE: WeatherKind[] = ["clear", "cloudy", "rain", "storm", "snow", "fog"]

/** 碰到什么就响什么：池塘溅水、树和草沙沙、鸡叫、门和稻草人闷响 */
const SPOT_SFX: Record<SpotId, SfxName | null> = {
  pond: "splash",
  tree: "rustle",
  field: "rustle",
  prop: "rustle",
  chicken: "cluck",
  house: "knock",
  scarecrow: "knock",
}

function hourOf(ms: number): number {
  const d = new Date(ms)
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}

export function FarmView(props: { onExit?: () => void }) {
  const { onExit } = props
  const [hud, setHud] = useState(true)
  const [paused, setPaused] = useState(false)
  const [active, setActive] = useState(true)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [manual, setManual] = useState<WeatherKind | null>(null)
  const [seasonPick, setSeasonPick] = useState<Season | null>(null)
  const [snap, setSnap] = useState<WeatherSnapshot | null>(null)
  const [tick, setTick] = useState(0)
  const [vol, setVol] = useState<AudioLevel>(getAudioLevel())

  // 虚拟时钟：壁纸自己走的时间，可以被加速
  const clockRef = useRef({ ms: Date.now(), last: 0 })
  const speedRef = useRef(1)
  const kindRef = useRef<WeatherKind>("clear")
  const seasonRef = useRef<Season>("summer")
  const touchRef = useRef(Date.now())
  const activeRef = useRef(true)
  const pausedRef = useRef(false)
  const hourRef = useRef(hourOf(Date.now()))
  const prevKindRef = useRef<WeatherKind>("clear")

  // 真实天气：一次就够，拿不到就当晴天，绝不让壁纸白屏
  useEffect(() => {
    let alive = true
    readWeather({ timeoutMs: 5000 }).then(s => {
      if (alive) setSnap(s)
    })
    return () => {
      alive = false
    }
  }, [])

  // 环境音：引擎一次起好，之后只推「时间 / 天气 / 季节」，走路由 audio.ts 自己算
  useEffect(() => {
    audioStart()
    // 脚步声：她迈一步响一下
    onFootstep(() => playSfx("step"))
    // 互动音效：碰了什么响什么
    onSpotTouch(id => {
      const name = SPOT_SFX[id]
      if (name) playSfx(name)
    })
    return () => {
      onFootstep(null)
      onSpotTouch(null)
      audioStop()
    }
  }, [])

  // 面板时钟：半秒推一次（Canvas 自己按 24fps 走，互不影响）
  // 顺手做自动隐藏：6 秒没动就把面板收起来，像个真正的壁纸
  useEffect(() => {
    let alive = true
    const loop = () => {
      if (!alive) return
      if (activeRef.current) {
        setTick(v => v + 1)
        // 环境音跟时间一起走：暂停/切走就淡下去，引擎不拆，回来立刻有声
        audioUpdate(hourRef.current, kindRef.current, seasonRef.current, !pausedRef.current)
        // 雨转雷雨那一下来一记，别敲着不放
        if (kindRef.current === "storm" && prevKindRef.current !== "storm" && !pausedRef.current) {
          playThunder()
        }
        prevKindRef.current = kindRef.current
        // 她一开口，就把面板叫回来（不然台词看不见），说完再隐去
        if (player.liveNote !== "") {
          touchRef.current = Date.now()
          setHud(true)
        } else if (Date.now() - touchRef.current > 6000) setHud(false)
      } else {
        audioUpdate(hourRef.current, kindRef.current, seasonRef.current, false)
      }
      setTimeout(loop, 500)
    }
    loop()
    return () => {
      alive = false
    }
  }, [])

  // 常驻在首页标签里时，切走就把画面停下来，不给电池添麻烦
  useEffect(() => {
    const off = Script.onHomeTabEvent(e => {
      const on = e !== "deselected"
      activeRef.current = on
      setActive(on)
    })
    return () => off()
  }, [])

  const toggleHud = () => {
    touchRef.current = Date.now()
    setHud(v => !v)
  }

  const kind: WeatherKind = manual ?? snap?.kind ?? "clear"
  kindRef.current = kind
  hourRef.current = hourOf(clockRef.current.ms)
  pausedRef.current = paused
  speedRef.current = SPEEDS[speedIdx]
  // 季节跟着（可以被加速的）虚拟时钟走：×600 时能看着一年在眼前转完
  const season: Season = seasonPick ?? seasonOf(new Date(clockRef.current.ms).getMonth())
  seasonRef.current = season

  const cycleSeason = () => {
    if (seasonPick == null) {
      setSeasonPick(SEASONS[0])
      return
    }
    const i = SEASONS.indexOf(seasonPick)
    setSeasonPick(i + 1 >= SEASONS.length ? null : SEASONS[i + 1])
  }

  const cycleWeather = () => {
    if (manual == null) {
      setManual(WEATHER_CYCLE[0])
      return
    }
    const i = WEATHER_CYCLE.indexOf(manual)
    setManual(i + 1 >= WEATHER_CYCLE.length ? null : WEATHER_CYCLE[i + 1])
  }

  const fullscreen = onExit != null

  return (
    <ZStack
      background="#05070c"
      preferredColorScheme="dark"
      onTapGesture={onExit == null ? undefined : { count: 3, perform: onExit }}
      {...(fullscreen ? { statusBarHidden: true, persistentSystemOverlays: "hidden" as const } : {})}
    >
      <TimelineCanvas
        draw={(ctx, size, time) => {
          const real = Date.now()
          const clock = clockRef.current
          if (clock.last === 0) clock.last = real
          const dt = Math.min(3000, Math.max(0, real - clock.last))
          clock.last = real
          clock.ms += dt * speedRef.current
          drawFrame(ctx, size, {
            hour: hourOf(clock.ms),
            t: time,
            weather: kindRef.current,
            season: seasonRef.current,
          })
        }}
        paused={paused || !active}
        schedule={{ minimumInterval: 1 / 24 }}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        ignoresSafeArea={true}
        onTapGesture={{
          perform: pt => {
            // 点一下画面：换算回世界坐标，她就往那儿走
            const w = tapToWorld({ x: pt.x, y: pt.y })
            moveTo(w.x, w.y)
            touchRef.current = Date.now()
          },
        }}
      />

      <FarmHud
        ms={clockRef.current.ms}
        kind={kind}
        snap={snap}
        manual={manual}
        season={season}
        seasonAuto={seasonPick == null}
        speedIdx={speedIdx}
        paused={paused}
        level={vol}
        visible={hud}
        tick={tick}
        note={player.liveNote}
        onSpeed={() => {
          touchRef.current = Date.now()
          setSpeedIdx(i => (i + 1) % SPEEDS.length)
        }}
        onPause={() => {
          touchRef.current = Date.now()
          setPaused(p => !p)
        }}
        onWeather={() => {
          touchRef.current = Date.now()
          cycleWeather()
        }}
        onSeason={() => {
          touchRef.current = Date.now()
          cycleSeason()
        }}
        onVolume={() => {
          touchRef.current = Date.now()
          const next = ((vol + 1) % 3) as AudioLevel
          setAudioLevel(next)
          setVol(next)
        }}
        onToggle={toggleHud}
        onExit={onExit}
      />
    </ZStack>
  )
}
