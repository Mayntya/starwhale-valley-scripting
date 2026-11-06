/**
 * screen.tsx — 全屏模态宿主：只负责拿到 dismiss，再把农场铺满整个画面
 */

import { Navigation } from "scripting"
import { FarmView } from "./farm-view"

export function FarmScreen() {
  const dismiss = Navigation.useDismiss()
  return <FarmView onExit={() => dismiss()} />
}
