/**
 * home_screen_default_ui.tsx — 让这个脚本出现在首页标签的脚本选择列表里
 *
 * 文件名必须叫这个、必须放在工程根目录、必须默认导出函数组件。
 * 这里没有 Navigation.present，也绝不能调 Script.exit()——那会杀掉常驻实例。
 */

import { FarmView } from "./farm-view"

export default function HomeScreenFarm() {
  return <FarmView />
}
