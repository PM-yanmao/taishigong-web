# 《太史公》美术需求与 GPT 出图提示词

> 给作者本人用：把下面的提示词逐条粘进 ChatGPT（GPT-4o / GPT-5 / GPT Image），保存成指定文件名，丢进 `assets/scene/`，跑一条命令就能上线。
> 现有 31 张图（10 背景 / 6 人物 / 13 结局 / 标题 / 壁画）已可用；本文件解决**缺的 22 张场景插画 + 杨恽立绘**，并给出可复用的提示词写法。

---

## 零、先看：现有美术基线

仓库里其实是**两套画风**，不要混：

| 类别 | 文件 | 尺寸 | 画风 |
| --- | --- | --- | --- |
| 场景背景 | `assets/bg/bg_*.jpg`（10 张） | 1920×1080 | 电影感写实历史剧照：冷青灰、体积光/雾、边缘水墨洇染、细颗粒 |
| 结局插画 | `assets/ending/ending_*.jpg`（13 张） | 1920×1080 | 同上 |
| 人物卡 | `assets/char/char_*.jpg`（6 张 + 杨恽占位） | 800×800 | **中国水墨人物画**：宣纸底、淡彩、留白、朱印 |
| 图鉴母图 | `assets/mural.jpg` | 1254×1254 | 水墨长卷 |

**22 张场景图走电影感写实；杨恽立绘走水墨宣纸**——两套提示词，别用错。

场景图在页面里是**全屏背景**，正文压在上面，所以构图要遵守：
- 主体放**中上/远景**，**画面下三分之一保持暗、干净**（会被白字盖住）；
- 整体偏暗，给正文留对比度；
- 画面里不要出现可读文字。

---

## 一、提示词怎么写（据 OpenAI 官方 Image prompting 指南）

OpenAI 的图像提示词指南给出的核心做法，[原文在此](https://platform.openai.com/docs/guides/image-prompting)：

1. **先定义结果**：说清主体、用途、构图、画幅比例和关键位置约束。复杂请求按 **Scene / Subject / Details / Constraints** 分段写，比一大段散文更稳。
2. **写可见细节**：材料、光、颜色、媒介都点名。想要照片感就明确写 "photorealistic"；**"电影感/冷/暗"不能只靠情绪词**，要写清尺度、空气感、色温。
3. **写人怎么写**：给身体取景、相对大小、视线、和物体的互动。例如 "full body visible, feet included"、"seen from behind"、"hands naturally holding the bamboo slips"。
4. **历史场景点名时间地点**：官方示例就是 "name the place and date"；模型会自己补细节，但**服饰、陈设、环境要自己核对**（这正是我们写死"西汉器物清单"的原因）。
5. **参考图要分配角色**：编号说明每张图负责什么（风格/配色/主体/背景），并说明怎么组合。不要只说"参考这张"。
6. **一次只改一件事**：先出图，再在对话里做窄幅修正（"只把下三分之一压暗"），比重新写一大段更有效。
7. **ChatGPT 里 1–3 句也能出好图**：[OpenAI Academy](https://openai.com/academy/image-generation/) 的说法是短提示词就够——所以下面每条我都写成"可长可短"：长版求稳，短版应急。

> 一句话：**主体 + 构图/画幅 + 光色 + 媒介/质感 + 史实约束，分段写；参考图说明角色；一次只调一个变量。**

---

## 二、通用模板（22 条都按这个结构）

```
Scene:         [地点 + 时间 + 正在发生什么]
Subject:       [一个匿名人物/主体，取景与相对大小，视线/动作]
Composition:   16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field;
               [主体位置]; the bottom third stays dark and uncluttered for text overlay.
Light & colour: [光源 + 色温 + 雾/尘]; cold desaturated blue-grey base with warm oil-lamp accents.
Style:         photorealistic historical drama still, Western Han dynasty China (2nd century BCE),
               period-accurate clothing and setting, fine film grain, ink-wash bleeding at the frame edges.
Constraints:   bamboo slips only (no paper books), no chairs or high furniture, no modern objects,
               no Buddhist or Japanese architecture, no blood, no text, no letters, no watermark.
```

**参考图怎么挂**（ChatGPT 上传或 API 传图）：
- **图 1 = 风格/配色参考**：`assets/bg/bg_court.jpg`。说明："Use image 1 only as the palette, lighting and ink-wash-edge reference — do not copy its subject, crowd or architecture."
- **图 2 = 次要参考**（可选）：`assets/bg/bg_prison.jpg`（石材/冷光/雾的质感）。
- 人物卡：**图 1 = 画风参考** `assets/char/char_simaqian.jpg`。说明："Match the ink-and-wash rice-paper portrait style of image 1; draw a different person."
- **出了第一张之后**：用已接受的那张（如 `assets/scene/L1.jpg`）当图 1 风格锚，比 `bg_court` 更准——同一套建筑语言、光比、人物比例。说明："Use image 1 only as the visual style and palette reference for the same film; draw a different scene."

**API 参数**（如果你走 API 而不是 ChatGPT 界面）：`size="1536x1024"`、`quality="high"`、复杂构图可把 `complexity` 调到 `high`；比例不对没关系，后面的脚本会中心裁切到 1920×1080。

---

## 三、22 张场景图提示词

> ⭐ = 自书开放页，最常被看到，建议先出这 6 张。
> 每条都按「Scene / Subject / Composition / Light / Style / Constraints」写全，可直接整段复制。

### ⭐ 1. L1 朝议（天汉二年十一月 · 宫中大殿）· 存为 `assets/scene/L1.jpg`

**中文要点**：西汉大殿朝议。远处御座高台、武帝端坐；两列官员席地而坐；近景下部一个孤零零站着的太史令背影；殿角炭盆、高窗雪光；满殿压着"斩"的气氛。

```
Scene: A vast Western Han palace audience hall in winter, during a tense imperial council. The emperor sits far away on a raised dais beneath a dark lacquered screen.
Subject: One anonymous official in a dark Han shenyi robe stands alone at the lower centre of the frame, seen from behind, small against the hall, holding a wooden tablet. Two long rows of court officials in black and dark-red robes kneel on woven mats facing the distant throne.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field. Throne in the upper third, lone figure at the lower third, the bottom third dark and uncluttered for text overlay.
Light & colour: cold snow light through high lattice windows, long god rays in drifting mist, warm embers from charcoal braziers along the colonnade; cold desaturated blue-grey base with warm gold accents.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate black-and-red court robes and lacquered architecture, fine film grain, ink-wash bleeding at the frame edges.
Constraints: bamboo slips and wooden tablets only, no paper books, no chairs or high furniture, no modern objects, no Buddhist or Japanese architecture, no blood, no text, no letters, no watermark.
```

### ⭐ 2. L2A 议罪（廷尉府）· 存为 `assets/scene/L2A.jpg`

**中文要点**：廷尉府公堂。低案上摊着判词木牍、墨迹未干；堂上官员俯视；阶下囚徒站着手缚麻绳；草席边摆着几件刑具，克制不血腥；高窗冷光。

```
Scene: A Han dynasty judicial hall (the office of the Commandant of Justice), a sentencing hearing. A wooden judgment tablet with fresh black ink lies on a low lacquered desk in the foreground.
Subject: A prisoner in a plain unbleached robe stands in the mid-ground, hands loosely bound with hemp rope, seen from a low three-quarter angle; two officials in dark robes sit on a raised platform behind the desk, looking down at him.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field. Judging desk lower left, prisoner centre, officials upper right, the bottom third dark and uncluttered.
Light & colour: cold daylight falling from a high barred window, dust in the beam, bare rammed-earth walls; cold blue-grey with a faint warm lamp note.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate rammed-earth hall, lacquer desk and hemp rope, fine film grain, ink-wash bleeding at the frame edges.
Constraints: a few restrained iron implements at the frame edge, no gore, no blood, bamboo slips and wooden tablets only, no paper books, no chairs or high furniture, no modern objects, no text, no letters, no watermark.
```

### ⭐ 3. L3 生死抉择（天汉三年 · 狱中）· 存为 `assets/scene/L3.jpg`

**中文要点**：单人牢房。石墙铁链、草席；席上分开放着一束帛、一把带鞘短刀、一盘麻绳（三样选择）；一束冷光从高处落下。**不画血、不画伤口、不画尸体。**

```
Scene: A single narrow Han dynasty prison cell, damp and cold. Rough stone walls, iron chains bolted to the wall, a worn straw mat on the floor, a heavy wooden door ajar in shadow.
Subject: Laid out separately on the straw mat: a folded bolt of plain silk, a short bronze blade still in its sheath, and a coil of hemp rope — three quiet objects, no blood, no wounds, no body. One thin shaft of cold light falls on them from a small barred opening high above.
Composition: 16:9 widescreen cinematic still, slightly high angle looking down at the mat, 35mm lens, shallow depth of field. The three objects in the lower-middle, the bottom edge dark and uncluttered.
Light & colour: single cold shaft of light, dust and mist in the air, deep shadows, cold blue-grey palette with almost no warmth.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate stone cell and hemp rope, fine film grain, ink-wash bleeding at the frame edges.
Constraints: no blood, no wounds, no body, no execution imagery, bamboo slips only, no paper books, no chairs or high furniture, no modern objects, no text, no letters, no watermark.
```

### ⭐ 4. A1 世态炎凉（太始年间 · 长安雪巷）· 存为 `assets/scene/A1.jpg`

**中文要点**：长安雪后傍晚的里巷。一个穿素色深衣的孤影背向镜头往巷深处走，雪地上一行脚印；两扇窗透出暖黄灯；汉代低檐瓦当。

```
Scene: A narrow lane in Chang'an after heavy snow, late afternoon turning to dusk.
Subject: A lone figure in a plain pale robe walks away down the lane, seen from behind and very small, leaving a single line of footprints in the fresh snow. Warm lamplight leaks from two lattice windows; a closed wooden gate and bare branches frame the lane.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field. Figure at the lower third, low walls converging into mist, the bottom dark and uncluttered.
Light & colour: cold blue twilight, warm yellow window light, snow haze and thin mist; cold desaturated palette with warm accents.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate low tiled eaves and plain robes, fine film grain, ink-wash bleeding at the frame edges.
Constraints: no paper books, no chairs, no modern objects, no Buddhist or Japanese architecture, no text, no letters, no watermark.
```

### ⭐ 5. A2 武帝审查（太始年间 · 宫中值房）· 存为 `assets/scene/A2.jpg`

**中文要点**：深夜宫中值房。矮案上摊着成捆竹简，最上一片被风吹得微翘；油灯将尽；窗缝进风；墙上书箧；一种"被人审读"的压迫感。

```
Scene: A night archive office inside the Han palace, after the emperor has read the manuscript. Bundles of bamboo slips tied with cords cover a low wooden desk; the topmost slip is lifted slightly by a draft.
Subject: The desk is the subject: a small bronze oil lamp burning low, a brush on its holder, an inkstone, one slip half unrolled. No people in frame.
Composition: 16:9 widescreen cinematic still, eye-level close view, 35mm lens, shallow depth of field. Desk lower left, lamp warm at centre, shelves receding into shadow upper right, the bottom third dark.
Light & colour: one low warm lamp flame bent by wind from a lattice window, cold blue night beyond; strong warm/cold contrast, dust in the air.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate lacquer chests, bamboo bundles and bronze lamp, fine film grain, ink-wash bleeding at the frame edges.
Constraints: bamboo slips only, no paper books, no chairs or high furniture, no modern objects, no text, no letters, no watermark.
```

### ⭐ 6. A3 任安之信（征和年间 · 夜）· 存为 `assets/scene/A3.jpg`

**中文要点**：夜室。案上一封折过三折的信（写在小木牍/帛上，不要现代信封），信角压一方小石；炭盆已冷；灯芯短；窗外有吏走过的影子。

```
Scene: A quiet night room in a Han official's residence, a letter that must be answered lying on the desk.
Subject: On a low desk, a folded letter on a small wooden board, creased three times, its corner held down by a smooth stone. A cold brazier with grey ashes, a low oil lamp, and bamboo slips pushed to one side. Behind the window lattice, the blurred shadow of a clerk passes.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field. Letter and lamp in the lower-middle, window shadow behind, the bottom third dark and uncluttered.
Light & colour: low warm lamp flame, cold blue night beyond the lattice, faint mist; deep shadows.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate wooden writing board and Han clothing, fine film grain, ink-wash bleeding at the frame edges.
Constraints: no modern paper envelope, no paper books, no chairs or high furniture, no modern objects, no text, no letters, no watermark.
```

### 7. P1 壮游江淮（元朔年间 · 二十岁）· 存为 `assets/scene/P1.jpg`

**中文要点**：江淮山水晨雾。一个背着竹简行囊的年轻士子站在木桥上，远处群山、大河、会稽方向；青绿冷调。

```
Scene: A misty river landscape in the Jianghuai region, early morning in the 2nd century BCE.
Subject: A young scholar of about twenty stands on an old wooden bridge above a wide grey river, a bamboo bundle of documents on his back, seen from behind and small in the frame. A fishing boat drifts downstream, reeds at the bank.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, deep layered space. Bridge and figure in the lower middle, mountains filling the upper half, the bottom dark and uncluttered.
Light & colour: cold damp dawn fog, desaturated blue-green mountains fading in layers, pale silver river light.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), ink-wash mountain atmosphere, fine film grain, ink-wash bleeding at the frame edges.
Constraints: bamboo slips only, no paper books, no modern objects, no Buddhist or Japanese architecture, no text, no letters, no watermark.
```

### 8. P2 父丧受命（元封元年 · 洛阳）· 存为 `assets/scene/P2.jpg`

**中文要点**：昏暗寝居。老人躺在矮榻上；年轻人跪在榻前握手；枕边一卷未写完的竹简，墨迹未干；油灯将尽。不画死亡特写。

```
Scene: A dim Han dynasty bedchamber at night, the last hour of a dying father.
Subject: An old man lies on a low wooden bed, thin and pale under a blanket; a young man kneels on the floor beside the bed, holding the old man's hand, his face turned away from the camera. On the pillow lies an unfinished bundle of bamboo slips, the last line still wet.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field. Bed upper left, kneeling figure centre, the bottom third dark.
Light & colour: a small oil lamp on the floor, warm trembling light on hands and bamboo, deep blue shadow in the rest of the room.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate low bed, curtain and bronze basin, fine film grain, ink-wash bleeding at the frame edges.
Constraints: no death close-up, no blood, bamboo slips only, no paper books, no chairs or high furniture, no modern objects, no text, no letters, no watermark.
```

### 9. P3 太史令任上（元封三年 · 石室金匮）· 存为 `assets/scene/P3.jpg`

**中文要点**：汉代皇家档案库。高架上成捆竹简、漆木书箧；一束光柱里浮尘；矮案上残简；没有纸质书、没有现代书架。

```
Scene: The interior of the Han imperial archive (the Stone Chamber and Golden Chest), vast, cold and quiet.
Subject: A young official in dark robes stands at a low desk, seen from behind, examining a broken bamboo slip. Tall wooden shelves hold bundles of bamboo slips tied with cords; lacquered chests are stacked on the floor.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, strong perspective down the aisle. A high window sends a god ray onto the desk and figure at lower left, shelves receding right, the bottom third dark.
Light & colour: single cold shaft of daylight through drifting dust, old wood and dust tones, cold blue-grey with a faint warm note from a lamp.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate archive, bamboo bundles and lacquered chests, fine film grain, ink-wash bleeding at the frame edges.
Constraints: bamboo slips only, no paper books, no modern shelving, no chairs or high furniture, no modern objects, no text, no letters, no watermark.
```

### 10. P4 泰山封禅（太初三年 · 东巡道上）· 存为 `assets/scene/P4.jpg`

**中文要点**：泰山盘道清晨。封禅队伍沿石阶而上，远处车驾旌旗；山顶石坛、云海；冷金晨光。不要明清寺庙、石狮、红墙黄瓦。

```
Scene: The winding stone ascent of Mount Tai at dawn during the imperial feng and shan sacrifice, 2nd century BCE.
Subject: A lone official in dark robes stands at the edge of the path in the foreground, seen from behind, watching a long procession of Han officials, chariots and banners climb the stairway far below. A simple stone altar stands on the summit above a sea of clouds.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, deep atmospheric perspective. Stairway diagonal from lower left to upper right, altar and clouds in the upper third, the bottom third dark.
Light & colour: cold golden dawn breaking through layered mist, blue mountain ridges fading, long shadows on stone.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate Han banners, chariots and simple stone altar, fine film grain, ink-wash bleeding at the frame edges.
Constraints: no Ming or Qing temples, no red walls or yellow tiles, no stone lions, no Buddhist or Japanese architecture, no modern objects, no text, no letters, no watermark.
```

### 11. P5 朝中结交（太初四年 · 杜周门前）· 存为 `assets/scene/P5.jpg`

**中文要点**：权臣门前暮色。车马盈门、宾客候立；门内深处高堂低案；一个犹豫的士人站在门阶外。

```
Scene: The gate courtyard of a powerful Han official's mansion at dusk in winter, busy with carriages and guests.
Subject: A scholar in a plain dark robe stands alone at the edge of the steps in the foreground, seen from behind, hesitating. Carriages and saddled horses crowd the lane, servants hold lanterns, a line of guests waits at the gate; beyond the gate a deep lamplit hall with low lacquered tables.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field. Gate and hall in the upper third, waiting guests mid-ground, hesitating figure lower left, the bottom third dark.
Light & colour: cold blue dusk and snow on the eaves, warm lantern and hall light, breath vapour in the cold air.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate Han carriages, robes and lacquered gate, fine film grain, ink-wash bleeding at the frame edges.
Constraints: no paper books, no chairs or high furniture, no modern objects, no Buddhist or Japanese architecture, no text, no letters, no watermark.
```

### 12. P6 李陵出征前夜（天汉二年秋 · 武台）· 存为 `assets/scene/P6.jpg`

**中文要点**：武台点兵。五千步卒列阵于台下，甲胄是汉代札甲/皮甲，不是明清铠甲；台上李陵回头望长安；秋日尘雾。

```
Scene: The Wu Terrace parade ground in autumn, late afternoon in 99 BCE, five thousand Han infantry mustered below the platform.
Subject: A general in dark red stands on the raised platform and turns his head to look back toward the distant city walls, seen from behind. The infantry stand in dark dusty formations below, leather and lamellar armour, banners hanging still. A young official in the foreground crowd watches.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, deep space. General on the platform upper left, formations diagonal in the mid-ground, foreground observer lower right, the bottom third dark.
Light & colour: low golden autumn light through dust haze, cold blue shadows, distant Chang'an a faint silhouette.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate Han lamellar and leather armour (not Ming or Qing armour), fine film grain, ink-wash bleeding at the frame edges.
Constraints: no fantasy armour, no paper books, no modern objects, no Buddhist or Japanese architecture, no text, no letters, no watermark.
```

### 13. L2B 免官（天汉二年冬 · 出长安）· 存为 `assets/scene/L2B.jpg`

**中文要点**：冬日城门。一辆载着几捆竹简的官车出城；一个刚被免官的士人站在车旁回头望宫墙；守卒远远站着；雪、灰天。

```
Scene: The gate of Chang'an in winter, a dismissed official leaving the city.
Subject: A plain ox cart loaded with a few bundles of bamboo slips stands just outside the gate. A dismissed official in a plain robe stands beside it, looking back at the high grey city wall, seen from behind and in profile. Gate guards with halberds keep their distance.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field. Wall and gate left, cart centre, figure back turned, the bottom third dark.
Light & colour: cold grey overcast sky, snow on wall and road, bare trees, muted desaturated palette.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate Han city gate, ox cart and plain robes, fine film grain, ink-wash bleeding at the frame edges.
Constraints: bamboo slips only, no paper books, no modern objects, no Buddhist or Japanese architecture, no text, no letters, no watermark.
```

### 14. L2C 升迁（天汉二年冬 · 受赏）· 存为 `assets/scene/L2C.jpg`

**中文要点**：暖堂受赏。成匹的帛堆在案上；贺客举杯；主人笑着受贺、另一只手攥紧袖口；暖光下有冷意。

```
Scene: A warm Han hall during a congratulatory banquet after a promotion.
Subject: Bolts of fresh plain silk are piled on a low lacquered table, almost too new. At the centre a scholar in an official's dark robe smiles and receives congratulations, while his other hand clenches his sleeve. Guests in fine robes sit on mats raising lacquer cups; musicians and lamps in the background.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field. Silk and table lower left, host centre, guests receding right, the bottom third dark.
Light & colour: amber oil-lamp and brazier light, warm gold dominating with a cold blue edge in the shadows.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate silk bolts, lacquer cups and Han robes, fine film grain, ink-wash bleeding at the frame edges.
Constraints: no paper books, no chairs or high furniture, no modern objects, no text, no letters, no watermark.
```

### 15. H1 装走狗（太始年间 · 甘泉道旁）· 存为 `assets/scene/H1.jpg`

**中文要点**：天未亮的道旁。一个官员缩着肩候在路边；远处皇帝车驾经过；冷风、霜草；姿态卑微。

```
Scene: A roadside before dawn on the road to Ganquan, frost on the grass and a cold wind.
Subject: A Han official in a dark robe stands at the edge of the road, shoulders drawn in, waiting humbly, seen from behind. In the far distance the imperial procession passes — banners, chariots, torchlight blurred in mist.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, deep space. Waiting figure lower left, procession small in the upper right, vast empty sky, the bottom third dark.
Light & colour: pre-dawn blue, faint warm torchlight in the far mist, frost on grass, breath vapour.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate Han banners, chariots and robes, fine film grain, ink-wash bleeding at the frame edges.
Constraints: no paper books, no modern objects, no Buddhist or Japanese architecture, no text, no letters, no watermark.
```

### 16. H2 收罪证（后元二年 · 尚书台）· 存为 `assets/scene/H2.jpg`

**中文要点**：夜间尚书台。抄写桌上摊着文书；一卷竹简被剖开夹层、里卷正被藏进去；削刀、灯；两侧堆满文书。

```
Scene: A night office in the Han imperial secretariat, where documents are copied and hidden.
Subject: A copying desk covered with official documents and bamboo slips, a writing knife and brush beside them. One bamboo scroll has been split open along its length; a second, hidden scroll is being slid into the hollowed layer. A low oil lamp lights the hands and the split bamboo; stacks of documents line the walls like a maze.
Composition: 16:9 widescreen cinematic still, slightly overhead three-quarter view, 35mm lens, shallow depth of field. Hands and split scroll in the lower centre, lamp warm, documents receding left and right, the bottom third dark.
Light & colour: one warm lamp flame, deep blue shadows, dust and secrecy.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate bamboo slips and writing knife, fine film grain, ink-wash bleeding at the frame edges.
Constraints: no paper books, no chairs or high furniture, no modern objects, no text, no letters, no watermark.
```

### 17. B1 民间疾苦（太始年间 · 江南旱）· 存为 `assets/scene/B1.jpg`

**中文要点**：江南旱灾村镇。龟裂田地、衙门前晒着干瘪谷子、一户门板被卸下靠在墙根；一个布衣旅人蹲着往简上记；灰褐冷调。

```
Scene: A drought-stricken village in the Jiangnan region, a county office gate at the roadside.
Subject: A traveller in coarse cloth, now a commoner, crouches at the roadside with a bamboo slip and writing knife, recording what he sees, seen from behind. Shrivelled grain is spread out to dry in the dust before the office; a woman's door plank has been taken off its hinges and leans against a wall.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field. Office gate and grain upper left, traveller lower right, the bottom third dark.
Light & colour: dry grey-brown desaturated daylight, dust haze, a single low lamp in a window for warmth.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate coarse clothing, county office and grain, fine film grain, ink-wash bleeding at the frame edges.
Constraints: bamboo slips only, no paper books, no modern objects, no text, no letters, no watermark.
```

### 18. B2 老友重逢（太始年间 · 江畔夜）· 存为 `assets/scene/B2.jpg`

**中文要点**：江畔夜饮。两人坐江边石上对饮陶碗；两卷竹简摊在地上；江雾、月光；旧友瘦、鬓白。

```
Scene: A riverbank at night in the south, two old friends meeting by the water.
Subject: Two men sit on a flat rock beside the river drinking from rough earthen bowls, a jar between them; one is thin with greying temples, the other seen from behind. Two bundles of bamboo slips lie unrolled on the ground between them. A small boat is tied nearby.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field. Two figures lower centre-left, river and moon upper right, the bottom third dark.
Light & colour: cold moonlight broken on the water, river fog, a faint warm note from the wine jar; deep blue-grey palette.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate earthenware and plain robes, fine film grain, ink-wash bleeding at the frame edges.
Constraints: bamboo slips only, no paper books, no modern objects, no text, no letters, no watermark.
```

### 19. C1 权力诱惑（太始年间 · 府中）· 存为 `assets/scene/C1.jpg`

**中文要点**：府中内室。两只漆匣打开，里面是汉代金饼（圆形带戳记，**不是元宝**）；帛书一卷；主人的手停在半空；烛光。

```
Scene: An interior room of a wealthy Han household, a bribe laid out on a low table.
Subject: Two opened black-lacquered boxes sit on a low table filled with Han gold cakes (round stamped gold pieces, not Chinese ingots). Beside them lies a roll of silk with writing on it and a pile of old documents. A scholar's hand hovers above the boxes, not yet touching, in the foreground; behind him a servant waits in shadow.
Composition: 16:9 widescreen cinematic still, eye-level over-shoulder view, 35mm lens, shallow depth of field. Boxes and hand lower centre, servant shadow upper right, the bottom third dark.
Light & colour: warm candlelight on lacquer and gold, cold blue shadow behind; temptation in warm/cold contrast.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate Han gold cakes, lacquer boxes and silk, fine film grain, ink-wash bleeding at the frame edges.
Constraints: no Chinese gold ingots, no paper books, no chairs or high furniture, no modern objects, no text, no letters, no watermark.
```

### 20. C2 良知煎熬（太始年间 · 夜读遗笔）· 存为 `assets/scene/C2.jpg`

**中文要点**：夜室。箱底取出的父亲遗简，只有三行字；灯贴近简面；简边有一道小时候刻的刀痕；窗外更鼓。

```
Scene: A night room, the father's unfinished bamboo scroll taken out of a chest.
Subject: On a low desk lies an old bundle of bamboo slips; only three lines are written, faded by water. A childhood knife mark is visible on the edge of one slip. The lamp flame is pulled close to the bamboo grain; an open chest and a stone weight sit on the floor.
Composition: 16:9 widescreen cinematic still, eye-level close view, 35mm lens, shallow depth of field. Slips and lamp lower centre, chest left, the bottom third dark.
Light & colour: one warm lamp flame lighting the bamboo fibre, deep blue darkness around, faint dust.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate bamboo slips, chest and bronze lamp, fine film grain, ink-wash bleeding at the frame edges.
Constraints: bamboo slips only, no paper books, no chairs or high furniture, no modern objects, no text, no letters, no watermark.
```

### 21. D1 刑场（天汉三年 · 冬）· 存为 `assets/scene/D1.jpg`

**中文要点**：冬日清晨市口刑场。**克制处理：不画行刑、不画血、不画尸体。**只画雪覆的市口、木砧、远处围观人群剪影、旗角、灰蓝天。

```
Scene: An empty execution ground at the market outside Chang'an, first light of a winter morning.
Subject: Hard frozen earth dusted with snow, a weathered wooden execution block in the middle distance, banners hanging limp, a few distant onlookers as blurred silhouettes behind a rope line, city wall and grey tiled roofs beyond.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, shallow depth of field. Block in the middle distance, crowd far right, empty snow foreground, the bottom third dark.
Light & colour: cold blue first light, thin mist, light snow falling; almost monochrome blue-grey.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate market ground and banners, fine film grain, ink-wash bleeding at the frame edges.
Constraints: no execution shown, no blood, no body, no weapon in focus, no paper books, no modern objects, no text, no letters, no watermark.
```

### 22. R1 流放（天汉三年 · 南行道上）· 存为 `assets/scene/R1.jpg`

**中文要点**：南方驿道细雨。一辆木轮官车，车上只有半部竹简；车中一个褪去官服的庶人；青山、驿亭；无人相送。

```
Scene: A muddy post road in the south under light rain, an exiled man travelling with no escort.
Subject: A single ox-drawn cart with wooden wheels moves slowly along the road; inside sits a man stripped of office in plain brown clothes, holding half a bundle of bamboo slips on his lap, seen from the side and behind. A small chest is his only luggage. A post-station pavilion stands at the roadside; the road ahead is empty.
Composition: 16:9 widescreen cinematic still, eye-level, 35mm lens, deep space. Cart lower left, road leading right into mist, pavilion upper right, the bottom third dark.
Light & colour: rain mist, desaturated blue-green southern hills, wet earth reflections, faint warm light in the pavilion.
Style: photorealistic historical drama still, Western Han dynasty China (2nd century BCE), period-accurate ox cart, plain clothing and post pavilion, fine film grain, ink-wash bleeding at the frame edges.
Constraints: bamboo slips only, no paper books, no modern objects, no Buddhist or Japanese architecture, no text, no letters, no watermark.
```

---

## 四、杨恽立绘（人物卡，水墨风）· 存为 `assets/char/char_yangyun.jpg`

**注意**：这一张跟上面 22 张**不是同一套画风**。先上传 `assets/char/char_simaqian.jpg` 当图 1，说：

> Image 1 is the style reference only: traditional Chinese ink-and-wash portrait on rice paper, warm off-white paper ground, light colour wash, minimal background, a small red seal stamp in a lower corner. Draw a different person in exactly this style. Square 1:1.

提示词（Scene / Character / Style / Constraints 结构）：

```
Scene: A traditional Chinese ink-and-wash portrait on rice paper, square format, no background scene.
Character: A Han dynasty aristocrat in his early thirties, calm and reserved, slightly proud, wearing a black gauze cap and a dark patterned robe of a marquis, both hands holding a bundle of bamboo slips as if presenting a book to the court. Three-quarter view, upper body, face clearly visible.
Style: traditional Chinese ink painting, xieyi brushwork, light grey ink wash and faint ochre only, warm off-white rice paper with faint ink bleed, one small square red seal stamp in the lower-left corner (no legible text), soft even light.
Constraints: square 1:1, no text or letters except the seal mark, no watermark, no Western oil-painting rendering, no modern objects, no background scenery.
```

**中文要点**：杨恽，司马迁外孙、平通侯，宣帝时把《太史公书》整理传布；画成三十出头、持简、克制而微带矜持的贵族；水墨宣纸、淡彩、朱印，与现有 6 张卡一致。（仓库里已有程序生成的临时占位，同名覆盖即可。）

---

## 五、短版提示词（ChatGPT 里赶时间用）

官方说 1–3 句就够。赶时间时用这个骨架，把方括号换掉即可：

```
[场景一句话]. A [人物取景] in [位置], seen from behind, small in frame.
16:9 cinematic still, cold desaturated blue-grey with warm lamp accents, mist and volumetric light,
ink-wash edges, fine film grain. Western Han dynasty, period-accurate clothing and bamboo slips.
No text, no watermark, no modern objects.
```

例（L1）："A tense Western Han palace council in winter. One lone official stands at the lower centre, seen from behind, small against the hall. 16:9 cinematic still, cold blue-grey with warm brazier light, mist, god rays, ink-wash edges, film grain. Western Han dynasty, period-accurate robes and bamboo tablets. No text, no watermark, no modern objects."

---

## 六、存图与上线（三步）

1. 按上面文件名存图（成批出图时先放一个源目录即可）：
   - 场景 → `assets/scene/<id>.jpg`（`P1.jpg`…`R1.jpg`，共 22 个）
   - 杨恽 → `assets/char/char_yangyun.jpg`
2. **调色**（GPT 出图通常比现有背景更暗、更暖，直接入库会跳色）：编辑 `tools/art-batch-map.json`，把这一批的「源文件名 → 节点 id → 目标中间调」写进去，然后：

```bash
python tools/art_grade.py --install
```

脚本会：中心裁切到 16:9 / 1920×1080（人物 800×800）→ 按目标提亮中间调 → 轻微降饱和 → 冷暗部/暖高光分区调色 → 轻对比/暗角 → 写入 `assets/scene/`（人物写 `assets/char/`）。
场景的 `target_p50` 参考：雪景/夜谈 0.20–0.27，牢房/暗室 0.16–0.19；人物卡不用填（有单独的人物卡调色）。

3. **入库/出 WebP/更新清单**（需要 Python + Pillow；脚本说明见 `tools/art_pipeline.py` 头部）：

```bash
# 图已经是 1920×1080 的 jpg：校验 + 出 WebP + 更新清单
python tools/art_pipeline.py --scan --optimize

# 图是 png / 比例不对（GPT 常出 3:2）：先归一化再走一遍
python tools/art_pipeline.py --normalize --scan --optimize

# 查缺 / 一把梭
python tools/art_pipeline.py --report
python tools/art_pipeline.py --all
```

脚本会：校验命名 → 中心裁切/缩放到 1920×1080（角色 800×800）→ 生成 `assets/webp/` → 重写 `js/data/scene-art.js` 清单。**刷新页面即可，不用改代码。**
只出了几张也能先跑——其余页面自动回退原来 10 张共用背景。

> 首批（L1/L2A/L3/A1/A2/A3 + 杨恽）已按这个流程入库；`tools/art-batch-map.json` 里保留了这一批的映射与目标值，下一批照抄改文件名即可。

---

## 七、验收清单（每张图过一遍）

- [ ] 16:9 / 方图，主体不在画面最底部（会被正文盖住）
- [ ] 没有文字、字母、水印、乱码印章、签名
- [ ] 没有现代物品（纸书、桌椅、玻璃、灯泡）
- [ ] 没有明清/日式元素（红墙黄瓦、鸟居、石狮、斗拱彩画）
- [ ] 服饰是汉代深衣/冠帽，不是明清官服、不是日式狩衣
- [ ] 色调合群：冷青灰 + 暖灯金，雾与体积光，边缘水墨感
- [ ] 人物匿名/背影，不画具体名人脸
- [ ] 不血腥：L3 三样物件、D1 空刑场
- [ ] 文件名完全一致，扩展名 `.jpg`（大小写敏感）

---

## 八、出图翻车时的修正话术（一次只改一件事）

- 出现文字/乱码：`Remove all text and lettering from the image. No writing anywhere.`
- 下三分之一太花：`Keep the same scene, but simplify and darken the bottom third — no objects, no detail there.`
- 太亮/不冷：`Same composition, colder blue-grey grade, dimmer overall, keep only the lamp warm.`
- 出现纸书/桌椅：`Replace any paper books with bamboo slips tied with cords; remove all chairs and high tables.`
- 人太多/太主角：`Keep only one anonymous figure in the lower third, seen from behind, much smaller in frame.`
- 画风偏欧美/偏游戏 CG：`More like a photorealistic historical film still, less concept-art and game CG; grain, real materials, natural skin texture.`
- 构图不对：`Shift the subject to [位置], keep the rest identical.`

---

## 九、参考与工具

- OpenAI 官方 Image prompting 指南（本文件方法依据）：https://platform.openai.com/docs/guides/image-prompting
- OpenAI Academy《Creating images with ChatGPT》：https://openai.com/academy/image-generation/
- 项目风格参考图：`assets/bg/bg_court.jpg`、`assets/bg/bg_prison.jpg`、`assets/char/char_simaqian.jpg`
- 管线脚本：`tools/art_pipeline.py`；清单：`js/data/scene-art.js`；WebP：`assets/webp/`

*流程图：ChatGPT 出图 → 按文件名存进 `assets/scene/` → `python tools/art_pipeline.py --normalize --scan --optimize` → 刷新页面验收。*
