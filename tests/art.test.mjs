/* ===== 美术资产管线测试 =====
 * 守住三件事：
 *  1. 生成物 js/data/scene-art.js 的结构与 22 个剧本节点对得上；
 *  2. 清单里登记的 jpg/webp 都真实存在于磁盘（TDD：不允许「写了清单没图」）；
 *  3. 前端真的接进去了：index.html 顺序、screens.js 的 <picture>/回退、CSS 的 image-set。
 *
 * 场景图 assets/scene/ 目前为空是设计状态（作者后续用 ChatGPT 生成再丢进来），
 * 所以缺图只报告、不失败；但一旦丢了图，命名与清单必须同步（跑 --scan --optimize）。
 * 本文件零第三方依赖，只用 node:test / node:fs / node:vm / node:path。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadBrowserGlobals, PROJECT_ROOT } from './helpers/load-browser-globals.mjs';

const env = loadBrowserGlobals();
const { SCENES, ENDINGS, CHARACTERS } = env.data;
const ART = env.json('TSG_SCENE_ART');

const abs = (rel) => path.join(PROJECT_ROOT, rel);
const exists = (rel) => fs.existsSync(abs(rel));
const readText = (rel) => fs.readFileSync(abs(rel), 'utf8');

/** 剧本 22 个节点 id（也是 assets/scene/ 允许的 22 个文件名） */
const SCENE_IDS = Object.keys(SCENES).sort();
const SCENE_ID_SET = new Set(SCENE_IDS);

/** 递归列出 assets/ 下的 jpg（项目路径格式，正斜杠） */
function listJpgAssets() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.jpe?g$/i.test(entry.name)) {
        out.push(path.relative(PROJECT_ROOT, full).split(path.sep).join('/'));
      }
    }
  };
  if (fs.existsSync(path.join(PROJECT_ROOT, 'assets'))) walk(path.join(PROJECT_ROOT, 'assets'));
  return out.sort();
}

/** 在经典脚本环境里补上 app.js 提供的 asset()，再加载 screens.js（只定义模板函数，不碰 DOM） */
function loadScreens() {
  const boot = loadBrowserGlobals();
  boot.context.asset = (p) => p; // 站点版 asset()：真实相对路径直接返回
  vm.runInContext(readText('js/ui/screens.js'), boot.context, { filename: 'js/ui/screens.js' });
  return boot;
}

/* ---------------------------------------------------------------- 清单结构 */

test('清单：js/data/scene-art.js 已加载，结构是 { ids, webp }', () => {
  assert.ok(ART && typeof ART === 'object', 'TSG_SCENE_ART 未挂到全局（index.html / helper 顺序？）');
  assert.ok(ART.ids && typeof ART.ids === 'object', 'TSG_SCENE_ART.ids 必须存在（作者还没丢图时为空对象）');
  assert.ok(ART.webp && typeof ART.webp === 'object', 'TSG_SCENE_ART.webp 必须存在');
  assert.equal(Array.isArray(ART.ids), false);
  assert.equal(Array.isArray(ART.webp), false);
});

test('清单 id：只登记 SCENES 里存在的节点，且不越出 22 个场景 id', () => {
  const unknown = Object.keys(ART.ids).filter((id) => !SCENE_ID_SET.has(id));
  assert.deepEqual(unknown, [], `scene-art 清单出现了非剧本节点 id: ${unknown.join('、')}`);

  for (const [id, entry] of Object.entries(ART.ids)) {
    assert.ok(entry.jpg, `${id} 的清单项缺少 jpg`);
    assert.ok(entry.jpg.startsWith('assets/scene/'), `${id}.jpg 必须指向 assets/scene/，实际 ${entry.jpg}`);
  }
  assert.ok(Object.keys(ART.ids).length <= SCENE_IDS.length);
});

test('清单文件：登记的 jpg 必须存在；登记了 webp 则 webp 也必须存在', () => {
  const missing = [];
  for (const [id, entry] of Object.entries(ART.ids)) {
    if (!exists(entry.jpg)) missing.push(`${id} → ${entry.jpg}`);
    if (entry.webp && !exists(entry.webp)) missing.push(`${id} → ${entry.webp}（webp 已登记但文件不存在）`);
  }
  assert.deepEqual(missing, [], `清单指向了不存在的文件: ${missing.join('、')}`);
});

test('清单 webp 映射：成对且文件都在，路径遵循 assets/webp/<同相对路径>.webp', () => {
  const problems = [];
  for (const [jpg, webp] of Object.entries(ART.webp)) {
    if (!exists(jpg)) problems.push(`原图不存在: ${jpg}`);
    if (!exists(webp)) problems.push(`WebP 不存在: ${webp}`);
    if (!webp.startsWith('assets/webp/') || !webp.endsWith('.webp')) {
      problems.push(`WebP 路径不规范: ${webp}`);
      continue;
    }
    const expected = 'assets/webp/' + jpg.replace(/^assets\//, '').replace(/\.jpe?g$/i, '.webp');
    if (webp !== expected) problems.push(`${jpg} 的 WebP 应为 ${expected}，实际 ${webp}`);
  }
  assert.deepEqual(problems, [], problems.join('；'));

  // 场景图当前为空：webp 映射里不应混进 assets/scene/ 的残留路径
  const staleScene = Object.keys(ART.webp).filter((p) => p.startsWith('assets/scene/'));
  assert.deepEqual(staleScene, [], `清单里有场景图 WebP 映射，但 assets/scene/ 已没有对应原图: ${staleScene.join('、')}`);
});

/* ---------------------------------------------------------------- 场景目录 */

test('场景目录：丢入的图必须命名为 22 个节点 id，且与清单完全同步', (t) => {
  const sceneDir = path.join(PROJECT_ROOT, 'assets', 'scene');
  const files = fs.existsSync(sceneDir)
    ? fs.readdirSync(sceneDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.(jpe?g|png)$/i.test(e.name))
      .map((e) => e.name)
    : [];

  const idsOnDisk = [];
  for (const name of files) {
    const id = path.parse(name).name;
    assert.ok(SCENE_ID_SET.has(id), `assets/scene/${name} 的 id「${id}」不属于剧本 22 个节点（文件名应为 P1.jpg 之类）`);
    idsOnDisk.push(id);
  }
  assert.deepEqual(
    [...new Set(idsOnDisk)].sort(),
    Object.keys(ART.ids).sort(),
    'assets/scene/ 里的图与 scene-art 清单不一致（丢了图后要跑 python tools/art_pipeline.py --scan --optimize）',
  );

  t.diagnostic(`assets/scene/ 当前有 ${files.length} 张，清单登记 ${Object.keys(ART.ids).length}/${SCENE_IDS.length} 张场景图`);
  if (files.length === 0) {
    t.diagnostic('场景图缺失按设计回退 assets/bg/ 的 10 张共用背景，不阻塞游戏');
  }
});

/* ---------------------------------------------------------------- 人物与结局 */

test('人物卡：7 位人物都有 portrait，且文件真实存在', (t) => {
  assert.ok(CHARACTERS.length > 0);
  for (const character of CHARACTERS) {
    assert.ok(character.portrait, `${character.id} 缺少 portrait`);
    assert.ok(exists(character.portrait), `${character.id} 的头像不存在: ${character.portrait}`);
    if (ART.webp[character.portrait]) {
      assert.ok(exists(ART.webp[character.portrait]), `${character.id} 头像登记了 WebP 但文件不存在`);
    }
  }
  const yangyun = CHARACTERS.find((c) => c.id === 'yangyun');
  assert.ok(yangyun, '人物档案缺少第 7 张「杨恽」卡');
  assert.equal(yangyun.name, '杨恽');
  assert.equal(yangyun.title, '平通侯');
  assert.ok(yangyun.bio.trim().length >= 20, '杨恽 bio 太短（要求 2–3 句史实）');
  t.diagnostic(`人物卡 ${CHARACTERS.length} 位：${CHARACTERS.map((c) => c.name).join('、')}`);
});

test('结局图：13 张 ending jpg 全部存在', (t) => {
  assert.equal(ENDINGS.length, 13, '结局应为 13 个');
  const missing = [];
  for (const ending of ENDINGS) {
    const file = `assets/ending/ending_${String(ending.id).padStart(2, '0')}.jpg`;
    if (!exists(file)) missing.push(file);
  }
  assert.deepEqual(missing, [], `结局图缺失: ${missing.join('、')}`);
  t.diagnostic(`结局图 ${ENDINGS.length} 张齐全（assets/ending/）`);
});

/* ---------------------------------------------------------------- 前端接入 */

test('前端接入：index.html 先加载 scene-art.js 再加载 screens.js', () => {
  const order = [...readText('index.html').matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const artIndex = order.indexOf('js/data/scene-art.js');
  const charIndex = order.indexOf('js/data/characters.js');
  const screensIndex = order.indexOf('js/ui/screens.js');
  assert.ok(artIndex >= 0, 'index.html 没有加载 js/data/scene-art.js');
  assert.ok(screensIndex > artIndex, 'scene-art.js 必须在 screens.js 之前加载');
  assert.ok(charIndex >= 0 && charIndex < artIndex, 'scene-art.js 应排在人物数据之后');
});

test('screens.js：场景图优先、无图回退 NODE_BG；artBg 输出 picture + WebP 源', () => {
  const boot = loadScreens();

  // 默认清单为空 → 回退共用背景
  assert.equal(boot.evaluate("bgPath({ id: 'P1' })"), 'assets/bg/bg_river.jpg');
  assert.equal(boot.evaluate("bgPath({ id: '未知节点' })"), '');
  assert.equal(boot.evaluate("webpOf('assets/title.jpg')"), 'assets/webp/title.webp');
  assert.equal(boot.evaluate("webpOf('assets/not-exist.jpg')"), '');

  // artBg：已登记 WebP 的原图 → <picture><source webp><img jpg>
  const html = boot.evaluate("artBg('assets/bg/bg_lamp.jpg', '灯')");
  assert.match(html, /^<div class="art" data-label="灯"><picture>/);
  assert.match(html, /<source type="image\/webp" srcset="assets\/webp\/bg\/bg_lamp\.webp">/);
  assert.match(html, /<img src="assets\/bg\/bg_lamp\.jpg"/);

  // 无 WebP 映射 → 只输出 <img>，不产生 404 source
  const plain = boot.evaluate("artBg('assets/none.jpg', '缺')");
  assert.equal(plain.includes('<source'), false);
  assert.match(plain, /<img src="assets\/none\.jpg"/);

  // 注入场景清单 → 场景图优先于共用背景（真实丢图后的行为）
  vm.runInContext(
    "TSG_SCENE_ART = { ids: { P1: { jpg: 'assets/scene/P1.jpg', webp: 'assets/webp/scene/P1.webp' } }, " +
    "webp: { 'assets/scene/P1.jpg': 'assets/webp/scene/P1.webp' } };",
    boot.context,
  );
  assert.equal(boot.evaluate("bgPath({ id: 'P1' })"), 'assets/scene/P1.jpg');
  const sceneHtml = boot.evaluate("artBg(bgPath({ id: 'P1' }), '壮游')");
  assert.match(sceneHtml, /<source type="image\/webp" srcset="assets\/webp\/scene\/P1\.webp">/);
  assert.match(sceneHtml, /<img src="assets\/scene\/P1\.jpg"/);
  // 其他节点仍回退共用背景
  assert.equal(boot.evaluate("bgPath({ id: 'P2' })"), 'assets/bg/bg_lamp.jpg');
});

test('冒烟：所有页面会用到的背景/人物/结局/图鉴图片路径都真实存在', (t) => {
  const boot = loadScreens();
  const missing = [];
  const check = (label, rel) => {
    if (!rel || !exists(rel)) missing.push(`${label} → ${rel || '（空路径）'}`);
  };

  // 22 个剧本节点的背景（场景图优先，否则 NODE_BG 共用背景）
  for (const id of Object.keys(SCENES)) {
    check(`节点 ${id} 背景`, boot.evaluate(`bgPath({ id: '${id}' })`));
  }
  // 开始页、缺图兜底、结局页、图鉴、人物卡
  check('开始页标题图', 'assets/title.jpg');
  check('生成中兜底背景', 'assets/bg/bg_court.jpg');
  for (const ending of ENDINGS) {
    check(`结局 ${ending.id} 图`, `assets/ending/ending_${String(ending.id).padStart(2, '0')}.jpg`);
  }
  check('图鉴 mural', 'assets/mural.jpg');
  for (const character of CHARACTERS) check(`人物 ${character.name}`, character.portrait);

  assert.deepEqual(missing, [], `以下前端图片路径不存在: ${missing.join('、')}`);
  t.diagnostic(`前端素材冒烟：22 节点背景 + 13 结局图 + 7 人物 + 标题/图鉴/兜底 全部存在`);
});

test('CSS：图鉴底图用 image-set 优先 WebP；screens.js 不再内联背景 url', () => {
  const css = readText('css/style.css');
  assert.match(css, /\.piece\.has\s*\{[\s\S]*?image-set\([\s\S]*?assets\/webp\/mural\.webp[\s\S]*?type\("image\/webp"\)[\s\S]*?assets\/mural\.jpg[\s\S]*?type\("image\/jpeg"\)/);
  assert.match(css, /\.art picture\s*\{/, 'CSS 需要处理 <picture> 壳（display: contents）');
  assert.match(css, /\.char-thumb picture\s*\{/, '人物卡 <picture> 壳需要 CSS 兜底');
  assert.equal(readText('js/ui/screens.js').includes('background-image:url'), false, 'screens.js 不应再内联图鉴背景 url');
});

/* ---------------------------------------------------------------- WebP 基线 */

test('WebP 基线：现有 jpg（背景/人物/结局/标题/图鉴）都有 WebP，场景图缺 webp 只提示', (t) => {
  const jpgs = listJpgAssets();
  assert.ok(jpgs.length >= 31, `assets/ 下 jpg 数量异常：${jpgs.length}`);

  const baseline = jpgs.filter((p) => !p.startsWith('assets/scene/'));
  const uncovered = baseline.filter((jpg) => {
    const webp = ART.webp[jpg];
    return !webp || !exists(webp);
  });
  assert.deepEqual(uncovered, [], `以下 jpg 还没有 WebP（跑 python tools/art_pipeline.py --optimize）: ${uncovered.join('、')}`);

  const sceneJpgs = jpgs.filter((p) => p.startsWith('assets/scene/'));
  const sceneUncovered = sceneJpgs.filter((jpg) => !ART.webp[jpg] || !exists(ART.webp[jpg]));
  if (sceneUncovered.length) {
    t.diagnostic(`【待办】场景图还没有 WebP：${sceneUncovered.join('、')}（跑 --optimize）`);
  }
  t.diagnostic(`WebP 覆盖：基线 ${baseline.length - uncovered.length}/${baseline.length}，场景图 ${sceneJpgs.length - sceneUncovered.length}/${sceneJpgs.length}`);
});
