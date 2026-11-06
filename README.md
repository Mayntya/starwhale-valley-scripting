# 星鲸谷物语 · Starwhale Valley

[![release](https://img.shields.io/github/v/release/Mayntya/starwhale-valley-scripting?color=7ab05c&label=release)](https://github.com/Mayntya/starwhale-valley-scripting/releases/latest)
[![license](https://img.shields.io/badge/license-MIT-7ab05c)](./README.md#许可)
[![platform](https://img.shields.io/badge/platform-Scripting%20%C2%B7%20iOS-e8c07a)](https://www.scripting.fun)

> 一个住进手机里的像素农场。天色按真实时间流动，庄稼按季节换装，天气取自你头顶那片云——
> 点一下地面，那只小鲸鱼就自己走过去。

<p align="center">
  <img src="docs/scene-day.png" width="24%" alt="清晨的农场" />
  <img src="docs/scene-dusk.png" width="24%" alt="黄昏，小鲸鱼在跑" />
  <img src="docs/scene-night.png" width="24%" alt="夜里提着灯" />
</p>

---

## 安装

**一键导入**（链接永远指向最新 release，不用管版本号）

<https://www.scripting.fun/import_scripts/?urls=%5B%22https%3A%2F%2Fgithub.com%2FMayntya%2Fstarwhale-valley-scripting%2Freleases%2Flatest%2Fdownload%2FStarwhale-Valley.scripting%22%5D>

手动方式：打开 [最新 release](https://github.com/Mayntya/starwhale-valley-scripting/releases/latest)，下载 `Starwhale-Valley.scripting`，用 Scripting App 打开即可。它会自动解压、改名、装进你的脚本库，不需要额外配置。

导入后同一个脚本有两个入口，作用不一样：

| 入口 | 怎么进 | 说明 |
|---|---|---|
| **全屏壁纸** | 脚本库 → 点「星鲸谷物语」 | 全屏模态，双击右上角 `✕` 或连点画面三下退出 |
| **首页标签** | Scripting 首页 → 长按空位 → 选「星鲸谷物语」 | 常驻标签，切走自动暂停，不提供退出键（退出会杀掉这个常驻实例） |

想把它当真正的「壁纸」用，走第二个入口：首页标签会一直活着，一整天自己变。

---

## 这一版能干什么

| | |
|---|---|
| **天光** | 9 个时段关键帧（0 / 4.2 / 6.4 / 8.6 / 12.5 / 16.6 / 19 / 21.5 / 24 点）之间平滑 `smoothstep` 插值，天光、云、远山、暗角一起走；日月按真实轨迹移动，月亮有相位，夜里偶尔有流星 |
| **季节** | 春（嫩苗 + 樱花）/ 夏（茂密 + 黄花的向日葵）/ 秋（麦穗 + 南瓜 + 落叶）/ 冬（短茬 + 雪人 + 树冠积雪），草地、山体、树冠、水面一起换色，萤火虫密度也跟着变 |
| **天气** | 走 WeatherKit 的真实天气，32 种 condition 收敛成 6 类，同一坐标缓存 10 分钟；拿不到就按季节和时段自己推算，**永不白屏**。雨丝、雪片、雾、闪电都有，池塘水面会跟着变浑 |
| **农场** | 农舍窗户入夜自动亮灯、烟囱冒烟、篱笆、池塘、橡树、稻草人、猫、鸡、小鸟、萤火虫 |
| **小鲸鱼** | 待机 6 帧、左右跑各 8 帧、被碰到时挥手 4 帧；入夜自己提灯，脚下有一圈暖光 |
| **控制面板** | 时钟 + 时段相位（中英）+ 日期、天气与温度（标注 `live` / `cache` / `fallback` / 手动预览）、×1 / ×60 / ×600 时间加速、暂停、收起 |
| **不打扰** | 静止 6 秒面板自动收起；小人开口说话时自动唤回来，不会让台词孤零零飘在屏上 |

---

## 怎么玩

- **点地面** —— 她会走过去，落点会自动避开池塘水面
- **走到东西旁边** —— 7 个互动点各有各的反应和台词

| 互动点 | 会怎样 |
|---|---|
| 田 | 按季节换词：蹭嫩苗 / 叶子长得真野 / 穗子压手 / 短茬踩着脆 |
| 稻草人 | 被戳得点两下头，草笠往前一沉 |
| 池塘 | 荡开两圈涟漪；冬天是「薄冰一碰就碎」 |
| 橡树 | 春天落樱花、秋天落黄叶、冬天扑簌掉雪 |
| 农舍 | 门锁着，从窗缝透出一点暖光 |
| 季节摆件 | 郁金香 / 向日葵 / 南瓜堆 / 歪鼻子的雪人 |
| 鸡 | 绕着你转一圈，咕咕叫 |

- **面板按钮** —— `⏱` 切 `实时 / ×60 / ×600`、`⏸` 暂停、`▤` 收起面板、`✕` 退出
- **季节点手** —— 点季节标签循环 `自动 → 春 → 夏 → 秋 → 冬 → 自动`
- **天气点手** —— 点天气标签循环 `自动 → 晴 → 阴 → 雨 → 雷雨 → 雪 → 雾 → 自动`，方便预览少见天气
- **想看完一整天** —— 开 ×600，一天约 2 分半钟；季节跟着虚拟日期走，换季要等它跨月，急的话直接点季节标签

---

## 四季与天气长什么样

<p align="center">
  <img src="docs/season-spring.png" width="23%" alt="春" />
  <img src="docs/season-summer.png" width="23%" alt="夏" />
  <img src="docs/season-autumn.png" width="23%" alt="秋" />
  <img src="docs/season-winter.png" width="23%" alt="冬" />
</p>

<p align="center">
  <img src="docs/weather-rain.png" width="31%" alt="秋日黄昏下雨" />
  <img src="docs/weather-snow.png" width="31%" alt="冬日黄昏飘雪" />
</p>

<p align="center">
  <img src="docs/whale-closeup.png" width="260" alt="小鲸鱼特写" />
</p>

---

## 它是怎么画出来的

- **全场只有 `fillRect`**，坐标取整到设备像素，所以放到多大的屏都是硬方块，不会有半透明毛边，也不需要任何图片资源（除了角色）。
- **角色是预烘焙贴图**：1536×1872 的精灵表用最近邻缩到 0.375 倍，单帧 72×78，烘成 `whale_day.png`；运行时 1:1 贴，不做任何运行时缩放（大屏按整数倍兜底放大）。
- **夜晚不靠遮罩**：先铺白天表，再按夜色深度用 `globalAlpha` 叠一张被 `lutrgb` 压暗成 0.42 / 0.45 / 0.60 的夜版表 —— 等价于逐像素线性插值，边缘也不会漏出背景色。
- **12 fps 的顿感是故意的**：场景动画的时间被量化成 `floor(t*12)/12`，角色另有 5 / 11 / 7 fps；跑成 60 fps 就变成滑片了。
- **配色是插出来的**：`theme.ts` 里一套 `Palette`（天空五段渐变、云、山、树、草、土、水……二十多个颜色，外加夜色 / 雾浓度等强度），9 个关键帧，`smoothstep` 插值，天气再叠一层 `gradePalette` 调色。
- **世界坐标只有 80 × 170**，画布按 `max(w/80, h/170)` 等比映射，所以点击坐标能一路换算回「她该走到哪里」。

---

## 文件结构

```
星鲸谷物语/
├── script.json                 # 显示名 / 图标 / 版本 / 描述（含中文本地化）
├── index.tsx                   # 运行入口：全屏模态打开 FarmScreen
├── screen.tsx                  # 全屏宿主（onExit 有值 → 提供退出）
├── home_screen_default_ui.tsx  # 首页标签宿主（onExit 为空 → 常驻、无退出）
├── farm-view.tsx               # 壁纸本体：一层 TimelineCanvas + 一层面板
├── world.ts                    # 场景绘制：天空/山/农舍/田/树/池塘/雨雪/角色 + 7 个互动点
├── theme.ts                    # 调色板、9 个时段关键帧、插值、天气分级、日月相位
├── season.ts                   # 四季判定、季节配色、萤火虫/流星密度
├── weather.ts                  # WeatherKit 接入 + 10 分钟缓存 + 永不失败的 fallback
├── player.ts                   # 角色状态机：走路、跑动帧、反应/冷却、台词
├── hud.tsx                     # 覆盖式控制面板
├── whale_day.png               # 精灵表（6 行 × 6/8/8/4 帧，单帧 72×78）
├── whale_night.png             # 同姿势的夜间压暗版
└── docs/                       # README 用的截图，不参与打包
```

---

## 常见问题

**Q：为什么首页标签里没有 `✕`？**
因为它是常驻实例，退出键会直接杀掉这个标签的脚本。想换掉就长按标签删除。全屏入口里才有退出。

**Q：天气一直显示「推算天气」？**
说明 WeatherKit 没给到数据：可能是没授权定位、没网，或者系统天气数据拿不到。这时它会按季节 + 时段自己编一个合理的天气，画面不会停。在面板上点天气标签也能手动指定。

**Q：颜色和手机系统时间差很多？**
检查是不是开了 ×60 / ×600，或者之前点过季节标签锁定了季节（标签会变成高亮，不再显示「自动」）。

**Q：一直挂着会很耗电吗？**
会有一点。它是 24 fps 的 Canvas 连续重绘，纯 `fillRect`，没有图片解码和合成层，但确实一直在算。首页标签切走后会自动暂停；不用的时候点一下 `⏸`。

**Q：能改颜色 / 加互动点 / 换角色吗？**
能，见下一节。

**Q：这不是要审核上架的 App 吧？**
不是，它是 [Scripting](https://www.scripting.fun) 的脚本，不经过 App Store，改完立刻生效。

---

## 想自己改

全部是 TypeScript，改完在 Scripting 里重跑就行。

**换配色** — `theme.ts` 的 `KEYS` 是 `[小时, Palette]` 数组，改 `BASE`（正午）、`DUSK`（黄昏）、`DEEP_NIGHT`（深夜）里的颜色，一天的气色就跟着变。想加时段就在 `KEYS` 里插一对。

**加一个互动点** — 三步：
1. `world.ts` 的 `SPOTS` 里加一条 `{ id, x, y, r, line }`，坐标是 80×170 的世界坐标，`line` 可以按季节返回不同台词；
2. `player.ts` 的 `SpotId` 联合类型补上这个 `id`；
3. 想让它「有反应」而不只是弹字，就去 `world.ts` 的 `pulse()` 里给这个 id 加一段动画（摇一下 / 荡一圈 / 抖叶子）。

**换角色精灵图** — 保持表结构一致即可：6 行（待机 6 帧 / 向右跑 8 帧 / 向左跑 8 帧 / 挥手 4 帧），单帧 72×78，脚底基线在帧内第 75 行。夜版用 ffmpeg 直接压暗，别手工涂：

```bash
ffmpeg -i src.png -vf "format=rgba,lutrgb=r=0.42*val:g=0.45*val:b=0.60*val" whale_night.png
```

**调节奏** — `hud.tsx` 的 `SPEEDS` / `SPEED_LABEL` 加倍速档；`farm-view.tsx` 的 `schedule={{ minimumInterval: 1/24 }}` 控制重绘上限。

**自己打包发布** — 用 Scripting 的导出功能生成 `.scripting`（本质是 zip），注意**压缩包内最外层的目录名必须和脚本目录名一致**，否则导入后显示名会变。发布时把附件命名成固定名字（如本仓库的 `Starwhale-Valley.scripting`），导入链接就能永久指向 `releases/latest/download/…`。

---

## Roadmap

- [ ] 拖拽小鲸鱼、踩到不同地面换音效
- [ ] 更多场景（海边 / 雪原 / 山顶），可切换
- [ ] 节日彩蛋（圣诞树、烟花、生日蛋糕）
- [ ] 锁屏 / 实时活动形态
- [ ] 启动时检查更新（读 `releases/latest` 比对 `script.json` 的 `version`）

---

## 更新记录

### 0.2.0
- 首发版本（功能其实已经到「能天天挂着看」的程度，编号从低开始，慢慢加）
- 全天候天光 + 四季 + WeatherKit 真实天气
- 可互动小鲸鱼：点击走路、7 个互动点、提灯、萤火虫
- 首页标签常驻、时间加速 ×60 / ×600、暂停

---

## 致谢

- 小鲸鱼精灵图来自 [petdex.dev](https://petdex.dev/pets/deepseek) 的宠物素材，**版权归原作者**，本仓库仅作个人学习与展示用途；原作者如有异议会立即替换为自制素材。
- 运行环境：[Scripting](https://www.scripting.fun) —— 在 iPhone 上写 SwiftUI / Canvas 的脚本 App。
- 名字向《星露谷物语》致敬，纯属玩梗，与本仓库无任何关联。

## 许可

代码以 MIT 授权。`docs/` 里的截图与角色精灵图的版权归各自原作者，不在 MIT 范围内。
