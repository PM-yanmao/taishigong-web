# 太史公 · 盛世与愤郁

> 一部关于司马迁的互动叙事：你替他做选择，也替他写下一行史书之外的话。
> 纯静态网页 + 可选的零依赖本地服务，为课堂演示而做。

- 线上只读版（GitHub Pages，自动离线模式）：https://pm-yanmao.github.io/taishigong-web/
- 本机完整版（可接大模型、有考据日志）：`npm start` → http://localhost:8787

---

## 一、这是什么

玩家以司马迁的身份走过 22 个场景节点：壮游江淮 → 父丧受命 → 太史令任上 → 泰山封禅 → 朝中结交 → 李陵出征 → 李陵之祸 → 受刑/赴死/赎死/辞官/逢迎等分支。四维隐藏数值（坚韧、名节、财富、权谋）与六种史迹标记（直笔、上意、交游、伪饰、远行、罪证）共同决定 7 条分支、13 个结局与 12 片图鉴。

特色是「自书」：在**朝议**与**生死抉择**两页，玩家可以不点选项，自己写一行动作或态度（每局 3 次）。这一行会由大模型（在线）或预生成剧本包（离线）写成一页正文，但——

> **自书只生成正文，不裁决状态。** 节点、分支、四维、结局、图鉴永远由前端确定性引擎按原剧本裁决。

另一条硬边界是史实锚点：`js/data/anchors.js` 固化时间轴、制度律令、人物状态与史料暗引白名单；`js/data/overreach.js` 定义「越界」类别。模型判为做不到的念头，会写成「被现实压回」的一页，而不是让它成功。

---

## 二、快速开始

### 1. 离线模式（零配置，课堂断网也能演示）

需要 Node 18+（只用到内置模块，没有任何第三方依赖）。

```bash
npm start          # = node server/start.mjs
# 或双击 start.bat
```

打开 http://localhost:8787 即可。没有配置 Key 时，服务端仍会启动，前端自动走 `js/data/genpack.js` 离线剧本包，所有选项、数值、结局照常工作。

> 也可以直接双击 `index.html` 或把整个目录丢给任意静态服务器——没有 `/api` 时会自动降级为离线模式。

### 2. 在线模式（接大模型，自书由模型写）

```bash
copy server\.env.example server\.env      # Windows
cp server/.env.example server/.env        # macOS / Linux
```

编辑 `server/.env`，至少填：

```ini
TSG_API_KEY=sk-...
TSG_MODEL=deepseek-chat        # 任何兼容 OpenAI chat/completions 的模型
TSG_API_URL=https://api.deepseek.com/chat/completions
```

然后 `npm start`，页面「设置」里应显示「接口已连接 · 模型 … · 锚点库 v1.0.0」。**Key 只存在服务端 `.env`，浏览器永远拿不到。**

多设备课堂（`TSG_HOST=0.0.0.0`）建议再设一个口令：

```ini
TSG_TOKEN=一串随机字符    # 启用后页面「设置 · 接口地址」里填同一个口令
TSG_RATE_LIMIT=30        # 每个 IP 每分钟最多生成次数，默认 30，0 = 不限
TSG_LOG=off              # 可选：不把玩家自书/生成正文写进 logs/（课后即焚）
```

`server/.env` 与 `logs/` 都在 `.gitignore` 中，不会被提交。

### 3. 开课前自检

```bash
npm run check      # 只探测地址，不启动服务
```

会打印教师机地址；只有 `TSG_HOST=0.0.0.0` 时才会打印局域网地址（并过滤虚拟网卡），UPnP 探测失败时静默跳过，不影响启动。

> ⚠️ 默认 `TSG_HOST=127.0.0.1` 只监听本机。若要同网段投屏/扫码访问，把 `server/.env` 里的 `TSG_HOST` 改为 `0.0.0.0` 再启动；此时同一局域网内任何人都能调用你的接口，**请同时设置 `TSG_TOKEN`**，下课记得关服务。

### 4. 清除本机记录

页面「设置 → 本机记录 → 清除本机记录」可一键清空本机所有玩家 ID / 局数 / 图鉴（共享设备下课前用）。

---

## 三、GitHub Pages 部署

仓库根目录就是站点根（`.nojekyll` 已就位），Pages 直接发布 `main` 分支根目录即可。Pages 上没有 `/api`，前端会自动进入离线剧本包模式；页面设置里可以填本机接口地址尝试跨域（https → http 属混合内容，各浏览器策略不同，课堂演示建议直接用 `http://localhost:8787` 同源访问）。

---

## 四、目录结构

```
index.html            入口：按固定顺序加载全部经典脚本
config.js             站点配置（apiBase / 限次 / 字数 / 超时 / 开放自书节点）
css/style.css         全部样式（无预处理器、无框架）
js/
  engine.js           核心引擎：resolve 判定 / collect 收集 / settle 结算 / 结局规则
  app.js              主循环、事件、路由、自书流程、攻略浮层
  client.js           本地接口客户端（health / generate / generate-stream）
  guard.js            史官校验（输入长度、输出 OOC/伪造史料、信封结构）
  intent.js           意图归一：一行文字 → 现有剧本里的一条边
  compose.js          离线剧本包拼装（正文 + 既有选项 id）
  store.js            localStorage 存档：按 ID 分桶、导出/导入
  ui/screens.js       全部界面模板（返回 HTML 字符串）
  ui/radar.js         四维雷达图 SVG
  data/anchors.js     史实锚点库 v1.0.0（时间轴/制度/人物/禁用词/史料白名单）
  data/overreach.js   越界类别规则（离线兜底判定用）
  data/scenes.p1.js   剧本第一批：序章 6 页 + 李陵之祸 5 页
  data/scenes.p2.js   剧本第二批：后期事件链 9 页 + 落幕 2 页
  data/scenes.js      场景表索引：合并、START_NODE、END_OF_STORY
  data/endings.js     13 个结局的标题/副题/正文变体
  data/characters.js  人物档案
  data/genpack.js     离线剧本包：设定/文风/框架/补白
server/
  index.mjs           HTTP 服务：静态站点 + /api/*（零依赖）
  start.mjs           一键启动：探测地址、局域网、UPnP，然后拉起 index.mjs
  guard.mjs           权威校验：复用浏览器同一份规则 + 服务端额外检查
  prompt.mjs          系统提示词与用户消息组装
  session.mjs         会话滚动记忆 + 教师课后抽查日志（logs/*.jsonl）
  .env.example        环境变量样例（复制为 .env）
docs/
  review-2026-11.md   接手时的完整代码审查报告（历史快照）
tests/                node:test 测试（npm test，零依赖）
logs/                 运行期日志（已 gitignore，只保留 .gitkeep）
```

**脚本没有构建步骤**：浏览器端是经典 `<script>` 全局脚本，服务端是原生 ESM（`.mjs`）。加载顺序看 `index.html`，不要随意调换——`engine.js` 里的常量被后续所有脚本引用。

---

## 五、核心设计（改代码前必读）

### 三层职责（`js/engine.js`）

| 函数 | 职责 | 是否写状态 |
| --- | --- | --- |
| `resolve(scenes, state, nodeId, optionId)` | 判定这一步的后果：下一节点 / 是否终局 / 门槛是否通过 | 否 |
| `collect(state, effect)` | 收集：四维增减（0–100 夹取）、flags、图鉴碎片、route、badCause、history | 返回新 state |
| `settle(state)` | 结算：按 route 规则判定结局、雷达图、相似度、图鉴进度 | 否 |

`state` 是唯一真值且可序列化；所有数值变更都必须经过 `collect()`。

### 剧本数据契约（`scenes.p1.js` / `scenes.p2.js`）

```js
P1: {
  id, title, era, art, text,          // art 为旧字段；实际背景走 screens.js 的 NODE_BG 映射
  autoEnd: true,                      // 可选：无选项的落幕页，只显示「继续」结算
  options: [{
    id: 'A',
    text: '深入乡野，问俗访古',
    effect: {
      d: { jian: 10 },                // 四维增减
      flags: { travel: 1, truth: 1 }, // 标记累加
      piece: 1,                       // 图鉴碎片（仅史实正解携带，1..12 各一处）
      route: 'PUNISH',                // 可选：切换分支（7 条：PUNISH/HIDDEN/DIE/REDEEM/FLATTER/RETIRE/BAD）
      badCause: 'T1',                 // 可选：BAD END 死因（决定结局 13 的文本变体）
    },
    gate: { stat: 'cai', min: 80, selectableWhenFailing: false,
            failTerminal: { endingId: 13, cause: 'T2' } },  // 可选门槛
    terminal: { endingId: 13, cause: 'T1' },                // 可选直接终局
    badIf: { stat: 'jian', max: 39, endingId: 13, cause: 'T3' }, // 可选条件终局
    showIf: { flag: 'truth', min: 4 },  // 可选：条件显示（隐藏线入口等）
    next: 'P2',                         // 或 '__END__'（END_OF_STORY）
  }]
}
```

结局判定在 `engine.js` 的 `RULES`（按 route 分组，末条必须是无条件兜底），文案变体在 `VARIANTS`。图鉴 12 片由 `validatePieces()` 保证「1..12 各由一处史实选项产出、不重不漏」。

### 自书链路

1. 前端 `TSG_Guard.checkInput` 只查长度，越界只分类不拒绝（关键字表仅作提示）。
2. 在线：`/api/generate-stream`（SSE，默认）或 `/api/generate`，服务端组装史实锚点提示词，模型先判可行性再写正文；返回 JSON 信封经前端 `guard.js` + 服务端 `guard.mjs` 双重校验。
3. 离线或在线失败：`TSG_Compose` 用 `genpack.js` 拼装同风格正文；越界走 `buildRefusal` 的预制否定段。
4. 无论正文从哪来，点「继续」都只是调用 `appChoose(既有选项 id)`——`resolve/collect/settle` 完全不变。

### 服务端接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | `{ok, model, hasKey, hasToken, anchors, nodeVersion}`，前端用它判断在线/离线 |
| POST | `/api/generate` | 非流式生成；`{ok:true, data}` 或 `{ok:false, error}` |
| POST | `/api/generate-stream` | SSE：`event: delta`（增量正文）、`retry`（校验不过重写）、`done`（完整信封）、`fallback`（回退离线包） |

`/api/*` 之外是静态站点；`/server/`、`/logs/`、`.env` 与任何点开头的路径一律 403，路径会做反斜杠/点段/真实路径三重校验。

生成接口只接受 **`nodeId` 为 `L1` / `L3`、`nextOptionId` 为该节点既有选项** 的请求（防止把本机 Key 当通用 LLM 用）；设置 `TSG_TOKEN` 后还必须带 `X-TSG-Token`；默认每个 IP 每分钟 30 次。CORS 默认关闭（只服务同源页面），只有显式配置 `TSG_ALLOW_ORIGIN` 才放行跨域。

### 存档

`localStorage` 键 `tsg:records:v1`：`{version, activeId, players: { [id]: {id, created, runs[], current} }}`。一局结束写入 `runs`，中途退出写 `current`（**指向下一步要显示的节点**）。图鉴由所有玩家 `runs[].pieces` 取并集，所以一台设备多人接力才能拼全 12 片。图鉴页可导出/导入 JSON 存档。

---

## 六、测试

```bash
npm test
```

用 Node 内置 `node:test`（零第三方依赖）覆盖：剧本数据一致性（节点/选项/结局/图鉴可达性）、引擎契约（resolve/collect/settle/gate/showIf）、离线剧本包拼装、服务端校验与提示词组装、前端与后端校验规则防漂移。测试不启动真实 HTTP、不调用真实模型。

> 沙箱/受限环境里子进程管道会被拒（`node --test` 默认多进程），因此 `npm test` 用 `--experimental-test-isolation=none` 单进程跑；普通环境可用 `npm run test:isolated`。

---

## 七、隐私与课堂安全

- **API Key 只在服务端** `server/.env`（已 gitignore）；任何情况下不要把 `.env` 提交或打包进课件。
- `logs/generate-*.jsonl` 与 `logs/fallback-*.jsonl` 会记录**玩家的原始自书、模型生成正文、考据备注**——这是给教师课后抽查用的。课后分发仓库/课件前请清空 `logs/`，或启动时设 `TSG_LOG=off` 不落盘。
- CORS 默认关闭、生成接口有节点白名单与限流；多设备课堂请设 `TSG_TOKEN`。**不要绑定公网、不要把 8787 端口长期映射到公网。**
- 学生自书内容会发给模型提供方（在线模式）；涉及真实姓名等隐私时，请提前说明或改用离线模式。
- 页面本身不含第三方统计、不加载外部 CDN，图片全部本地。

---

## 八、接手备注 / 已知限制

- 项目刻意保持**零依赖、无构建**：加测试也只用 `node:test`；不要为了一个小功能引入打包器。
- 代码注释里引用的 `docs/04-决策基线`、`docs/07-美术需求清单` 等资料**不在本仓库**（项目从更大的制作目录抽出来）。历史背景以代码与 `anchors.js` 为准。
- 剧本节点 `art` 字段指向 `assets/scene/*.jpg`，仓库里没有这些图；实际背景由 `js/ui/screens.js` 的 `NODE_BG` 映射到 `assets/bg/bg_*.jpg`（10 张共用图覆盖 22 页）。`art` 仅作旧数据保留，缺图时页面会显示占位块而非报错。
- 模型输出质量依赖 `server/prompt.mjs` 的锚点与输出校验；改提示词后请跑 `npm test` 并至少手测一次在线自书（可行 / 越界 / 校验重写三条路径）。
- 尚未处理的产品级问题：部分页面字数低于 150 字规范、少数选项文案短于 8 字、`ENDINGS` 里几处"几个字"的计数与引文不符；`anchors.persons` 有杨恽而人物档案只有 6 张卡。这些属于内容打磨，不影响运行。
- 本仓库未声明开源许可证；对外分发或二次开发前请先与作者确认。

---

## 九、v1.1 接手修复记录（2026-11）

接手时项目无 README、无测试。第一轮完成：

**服务端（P0）**
- 修复 `GET /%` 等畸形 URL 触发未捕获 `URIError` → 进程退出的崩溃（现返回 400 且服务存活）。
- 修复静态文件黑名单可被 `%5c` 反斜杠绕过导致的任意文件读取（`server/index.mjs` 现做反斜杠/点段/`path.relative`/`realpath` 四重校验）。
- CORS 默认关闭（仅同源）；新增可选 `TSG_TOKEN` 口令、按 IP 限流、`nodeId`/`nextOptionId` 白名单、请求体 64KB 上限与 413、安全响应头、静态资源缓存；`.env` 里的值统一进 `process.env`。

**前端（P1）**
- 续玩存档改为存「下一步要显示的节点」，修掉刷新后可重答同一页刷数值/碎片的问题；续玩保留自书次数与 `customCount`。
- `selectableWhenFailing` 在 UI 真正生效：L2A「当庭指斥酷吏（凶多吉少）」现在可点，结局 13「廷尉堂」变体可达。
- A3「了此残生」改为直接终局（结局 13 / `silkworm` 变体），不再依赖不可达的 `badIf` 阈值。
- 自书中性输入不再被静默映射到列表第一项（原来"站着不动"会被送进辩护/宫刑线）；自书自动承接选项时不点亮图鉴，与攻略文案一致。
- 排行榜按相似度降序，「只看正统局」按 `orthodox` 过滤；坏存档自动清洗不再白屏；新增「清除本机记录」；导入存档做字段白名单，雷达图数值强制转数字（修 XSS 面）；起句示例按钮可点击填入。
- 时间线修正：P4 封禅改为太初三年、P5 太初四年、H2 后元二年（新帝登基），不再出现年代倒流。

**工程**
- 新增 `README.md` 与 `tests/`（`npm test`，零依赖）。
- 首次接手时的完整代码审查报告（含 P0/P1/P2 清单、数据交叉校验方法与结果）见 `docs/review-2026-11.md`。

---

*《太史公》互动叙事 · 课堂演示版*
