/**
 * 星鲸谷物语 · Starwhale Valley
 *
 * 一张跟着真实时间和真实天气走的像素壁纸：
 * 天空、远山、农舍、田垄、池塘、雨雪全部由 Canvas 手绘，没有一张位图。
 */

import { Script, Navigation } from "scripting"
import { FarmScreen } from "./screen"

async function run() {
  await Navigation.present({
    element: <FarmScreen />,
    modalPresentationStyle: "fullScreen",
  })
  Script.exit()
}

run()
