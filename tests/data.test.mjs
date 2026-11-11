/* ===== 数据一致性测试 =====
 * 只读 js/ 下的剧本/结局/图鉴数据，不改数据。
 * 发现的数据问题用 t.diagnostic 输出观察清单；只有「结构性契约」才硬失败。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadBrowserGlobals, PROJECT_ROOT, toHost } from './helpers/load-browser-globals.mjs';

const env = loadBrowserGlobals();
const { data, engine } = env;
const { SCENES, ENDINGS, ENDING_TEXTS, PIECES, GALLERY_TOTAL, CHARACTERS } = data;

/* ---------------------------------------------------------------- 工具 */

/** 全状态 BFS：模拟 app.js 的 appChoose 链路
 *  resolve(判定) → collect(收集) → 下一节点 / 结算(settle)。
 *  同 (nodeId, 状态签名) 只展开一次；状态签名不含 history（history 只用于展示）。 */
function explorePlaythroughs() {
  const { START_NODE, END_OF_STORY } = data;
  const seen = new Set();
  const reachedNodes = new Set();
  const routes = new Set();
  const endings = new Map(); // endingId -> Set(variant)
  let terminalRuns = 0;

  const signature = (s) =>
    JSON.stringify({
      jian: s.jian, ming: s.ming, cai: s.cai, quan: s.quan,
      flags: s.flags, route: s.route, badCause: s.badCause, pieces: s.pieces,
    });

  const recordEnding = (state) => {
    const result = toHost(engine.settle(state));
    terminalRuns += 1;
    if (!endings.has(result.endingId)) endings.set(result.endingId, new Set());
    endings.get(result.endingId).add(result.variant);
  };

  const queue = [{ nodeId: START_NODE, state: engine.createState() }];
  while (queue.length > 0) {
    const { nodeId, state } = queue.shift();
    reachedNodes.add(nodeId);
    if (state.route) routes.add(state.route);

    const key = nodeId + '|' + signature(state);
    if (seen.has(key)) continue;
    seen.add(key);

    const node = SCENES[nodeId];
    assert.ok(node, `BFS 走到了不存在的节点: ${nodeId}`);
    if (node.autoEnd) {
      recordEnding(state);
      continue;
    }

    for (const opt of toHost(engine.visibleOptions(node, state))) {
      const r = toHost(engine.resolve(SCENES, state, nodeId, opt.id));
      if (!r.ok) continue; // gate 不满足且不可冒险 → 浏览器里就是灰化不可选
      const nextState = engine.collect(state, {
        ...(r.effect || {}),
        nodeId,
        optionId: opt.id,
        badCause: r.badCause,
      });
      if (r.endingId) {
        recordEnding(nextState);
        continue;
      }
      if (r.nextNodeId === END_OF_STORY) {
        recordEnding(nextState);
        continue;
      }
      assert.ok(SCENES[r.nextNodeId], `${nodeId}/${opt.id} 的 next 指向不存在的节点 ${r.nextNodeId}`);
      queue.push({ nodeId: r.nextNodeId, state: nextState });
    }
  }

  return { seenStates: seen, reachedNodes, routes, endings, terminalRuns };
}

const exploration = explorePlaythroughs();

/* ---------------------------------------------------------------- 场景结构 */

test('场景表：节点 id 唯一、键与 id 一致、起始/结束标记合法', (t) => {
  const ids = Object.keys(SCENES);
  assert.ok(ids.length > 0, 'SCENES 不能为空');
  assert.equal(new Set(ids).size, ids.length, '节点 id 必须唯一');

  for (const [key, node] of Object.entries(SCENES)) {
    assert.equal(node.id, key, `节点 ${key} 的 id 字段应等于键名`);
    assert.equal(typeof node.title, 'string', `${key}.title`);
    assert.ok(node.title.trim(), `${key} 缺少 title`);
    assert.equal(typeof node.era, 'string', `${key}.era`);
    assert.ok(node.era.trim(), `${key} 缺少 era`);
    assert.equal(typeof node.text, 'string', `${key}.text`);
    assert.ok(node.text.trim().length > 0, `${key} 缺少正文 text`);
  }

  assert.ok(Object.hasOwn(SCENES, data.START_NODE), `START_NODE ${data.START_NODE} 不在 SCENES 中`);
  assert.equal(typeof data.END_OF_STORY, 'string');
  assert.ok(data.END_OF_STORY.length > 0, 'END_OF_STORY 不能为空串');
  assert.ok(!Object.hasOwn(SCENES, data.END_OF_STORY), 'END_OF_STORY 是哨兵，不应是真实节点');

  // 记录：22 个节点全部保留 id 字段
  t.diagnostic(`SCENES 节点数 ${ids.length}，START_NODE=${data.START_NODE}，END_OF_STORY=${data.END_OF_STORY}`);
});

test('选项结构：id 唯一、next 合法；非 autoEnd 节点至少 2 个选项', (t) => {
  const endingIds = new Set(ENDINGS.map((e) => e.id));
  const zeroOptionNodes = [];

  for (const [nodeId, node] of Object.entries(SCENES)) {
    const options = node.options || [];
    if (node.autoEnd) {
      assert.equal(options.length, 0, `${nodeId} 是 autoEnd 落幕页，不应配置选项`);
      zeroOptionNodes.push(nodeId);
      continue;
    }

    assert.ok(options.length >= 2, `${nodeId} 只有 ${options.length} 个选项（要求至少 2 个）`);
    const optIds = options.map((o) => o.id);
    assert.equal(new Set(optIds).size, optIds.length, `${nodeId} 内选项 id 必须唯一`);

    for (const opt of options) {
      assert.equal(typeof opt.text, 'string', `${nodeId}/${opt.id}.text`);
      assert.ok(opt.text.trim(), `${nodeId}/${opt.id} 缺少选项文案`);

      if (opt.terminal) {
        assert.equal(opt.next, undefined, `${nodeId}/${opt.id} 不能同时配置 next 与 terminal`);
        assert.ok(endingIds.has(opt.terminal.endingId), `${nodeId}/${opt.id} 的 terminal.endingId 未定义`);
      } else {
        assert.ok(opt.next, `${nodeId}/${opt.id} 必须配置 next 或 terminal`);
      }
      if (opt.next) {
        const isSentinel = opt.next === data.END_OF_STORY;
        assert.ok(isSentinel || Object.hasOwn(SCENES, opt.next), `${nodeId}/${opt.id} 的 next 指向不存在的节点: ${opt.next}`);
      }
      if (opt.badIf) {
        assert.ok(endingIds.has(opt.badIf.endingId), `${nodeId}/${opt.id} 的 badIf.endingId 未定义`);
      }
      if (opt.gate?.failTerminal) {
        assert.ok(endingIds.has(opt.gate.failTerminal.endingId), `${nodeId}/${opt.id} 的 gate.failTerminal.endingId 未定义`);
      }
    }
  }

  t.diagnostic(`autoEnd 落幕页（0 选项，由 settle 直接结算）：${zeroOptionNodes.join('、')}`);
  t.diagnostic('全部非 autoEnd 节点均满足「至少 2 个选项」');
});

/* ---------------------------------------------------------------- 图鉴 */

test('图鉴：GALLERY_TOTAL/PIECES 数量匹配，片号 1..N 各产出一处', (t) => {
  assert.equal(Number.isInteger(GALLERY_TOTAL), true, 'GALLERY_TOTAL 必须是整数');
  assert.equal(PIECES.length, GALLERY_TOTAL, 'PIECES 数量必须等于 GALLERY_TOTAL');

  const pieceIds = PIECES.map((p) => p.id).sort((a, b) => a - b);
  assert.deepEqual(pieceIds, Array.from({ length: GALLERY_TOTAL }, (_, i) => i + 1), 'PIECES 的 id 必须恰好是 1..N');

  // 引擎自带校验：1..12 每片恰好一个产出点、不越界
  const checked = toHost(engine.validatePieces(SCENES));
  assert.deepEqual(checked.problems, [], 'validatePieces 报告了图鉴问题');
  assert.equal(Object.keys(checked.map).length, GALLERY_TOTAL, '碎片产出点数量应等于图鉴总片数');

  // 独立复核：每个碎片的产出选项恰好一处
  const produceCount = new Map();
  for (const [nodeId, node] of Object.entries(SCENES)) {
    for (const opt of node.options || []) {
      const piece = opt.effect?.piece;
      if (piece == null) continue;
      assert.ok(Number.isInteger(piece) && piece >= 1 && piece <= GALLERY_TOTAL, `${nodeId}/${opt.id} 碎片编号越界: ${piece}`);
      produceCount.set(piece, (produceCount.get(piece) || 0) + 1);
    }
  }
  for (let i = 1; i <= GALLERY_TOTAL; i++) {
    assert.equal(produceCount.get(i), 1, `碎片 ${i} 的产出点数量应为 1，实际 ${produceCount.get(i) || 0}`);
  }

  // 全图鉴进度接口自洽
  const all = engine.createState();
  all.pieces = pieceIds;
  const progress = toHost(engine.galleryProgress(all));
  assert.equal(progress.total, GALLERY_TOTAL);
  assert.equal(progress.owned, GALLERY_TOTAL);
  assert.equal(progress.complete, true);
  assert.equal(progress.cells.length, GALLERY_TOTAL);
  for (const cell of progress.cells) {
    assert.ok(cell.row >= 0 && cell.row < data.GALLERY_ROWS, `碎片 ${cell.id} 行号越界`);
    assert.ok(cell.col >= 0 && cell.col < data.GALLERY_COLS, `碎片 ${cell.id} 列号越界`);
  }

  t.diagnostic(`图鉴 ${GALLERY_TOTAL} 片，产出节点：${Object.entries(checked.map).map(([p, where]) => `${p}→${where}`).join('，')}`);
});

/* ---------------------------------------------------------------- 结局 */

test('结局表：13 个结局与文案一一对应，引擎判定规则完整', (t) => {
  assert.ok(ENDINGS.length > 0, 'ENDINGS 不能为空');
  const endingIds = ENDINGS.map((e) => e.id);
  assert.equal(new Set(endingIds).size, endingIds.length, '结局 id 必须唯一');

  // 引擎判定表必须覆盖每个结局且每条 route 末条兜底
  assert.deepEqual(toHost(engine.validateRules()), [], 'validateRules 报告了判定表问题');

  const routes = new Set(data.ROUTES);
  for (const ending of ENDINGS) {
    assert.ok(routes.has(ending.route), `结局 ${ending.id} 的 route 不在 ROUTES 中: ${ending.route}`);
    assert.equal(typeof ending.name, 'string');
    assert.ok(ending.name.trim(), `结局 ${ending.id} 缺少 name`);
    assert.equal(typeof ending.orthodox, 'boolean', `结局 ${ending.id}.orthodox 应为布尔值`);
  }
  assert.equal(ENDINGS.filter((e) => e.orthodox).length, 1, '只有结局 1（正统史实）应标记 orthodox');

  // 结局文案：每个 id 都有文案；非正统结局不带 orthodoxEffect
  for (const ending of ENDINGS) {
    const text = ENDING_TEXTS[ending.id];
    assert.ok(text, `结局 ${ending.id} 缺少 ENDING_TEXTS 文案`);
    assert.equal(text.title, ending.name, `结局 ${ending.id} 的标题与 ENDINGS.name 不一致`);
    if (text.variants) {
      for (const [key, variant] of Object.entries(text.variants)) {
        assert.ok(variant.body.trim(), `结局 ${ending.id} 分档 ${key} 缺正文`);
        assert.ok(variant.subtitle.trim(), `结局 ${ending.id} 分档 ${key} 缺副标题`);
      }
      // engine.VARIANTS 声明的分档键必须都有文案，否则 getEndingText 会静默取错档
      const engineKeys = data.VARIANT_KEYS[String(ending.id)] || [];
      for (const key of engineKeys) {
        assert.ok(Object.hasOwn(text.variants, key), `结局 ${ending.id} 的引擎分档 ${key} 在 endings.js 中没有文案`);
      }
    } else {
      assert.ok(text.body.trim(), `结局 ${ending.id} 缺正文`);
    }
  }
  assert.equal(ENDING_TEXTS[1].orthodoxEffect, true, '结局 1 应带 orthodoxEffect');
  for (const ending of ENDINGS.filter((e) => !e.orthodox)) {
    assert.notEqual(ENDING_TEXTS[ending.id]?.orthodoxEffect, true, `非正统结局 ${ending.id} 不应带 orthodoxEffect`);
  }

  t.diagnostic(`结局 ${ENDINGS.length} 个；带文本分档的结局：${Object.keys(data.VARIANT_KEYS).join('、')}`);
});

test('可达性：全部 13 个结局都能从 START_NODE 走到（全状态 BFS）', (t) => {
  const reached = [...exploration.endings.keys()].sort((a, b) => a - b);
  const expected = ENDINGS.map((e) => e.id).sort((a, b) => a - b);
  assert.deepEqual(reached, expected, '存在从 START_NODE 不可达的结局');

  // 分支路由：数据里能进的所有 route 都应被 BFS 实际走到
  const declaredRoutes = new Set();
  for (const node of Object.values(SCENES)) {
    for (const opt of node.options || []) {
      if (opt.effect?.route) declaredRoutes.add(opt.effect.route);
    }
  }
  for (const route of declaredRoutes) {
    assert.ok(exploration.routes.has(route), `选项声明了 route=${route}，但 BFS 没有走到`);
  }

  t.diagnostic(
    `BFS 展开 ${exploration.seenStates.size} 个（节点+状态）组合，结算 ${exploration.terminalRuns} 条完整路径；` +
    `路由 ${[...exploration.routes].join('、')}`,
  );
  t.diagnostic(
    `各结局可达分档：${[...exploration.endings.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, vars]) => `${id}:[${[...vars].join(',')}]`)
      .join(' ')}`,
  );

  // 仅报告、不阻断：数据问题（例如分档条件永远不成立）留给数据维护者确认
  const unreachableVariants = [];
  for (const [id, keys] of Object.entries(data.VARIANT_KEYS)) {
    const got = exploration.endings.get(Number(id)) || new Set();
    for (const key of keys) {
      if (!got.has(key)) unreachableVariants.push(`${id}:${key}`);
    }
  }
  if (unreachableVariants.length > 0) {
    t.diagnostic(`【数据问题】以下结局文案分档在当前数据下不可达：${unreachableVariants.join('、')}`);
  }
});

test('节点图：所有节点都能从 START_NODE 到达，且无死路', (t) => {
  const reachable = new Set([data.START_NODE]);
  const queue = [data.START_NODE];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = SCENES[nodeId];
    if (!node) continue;
    for (const opt of node.options || []) {
      if (opt.next && opt.next !== data.END_OF_STORY && !reachable.has(opt.next)) {
        reachable.add(opt.next);
        queue.push(opt.next);
      }
    }
  }
  const unreachable = Object.keys(SCENES).filter((id) => !reachable.has(id));
  assert.deepEqual(unreachable, [], `存在从 START_NODE 不可达的节点: ${unreachable.join('、')}`);

  for (const nodeId of reachable) {
    const node = SCENES[nodeId];
    if (node.autoEnd) continue;
    assert.ok((node.options || []).length > 0, `${nodeId} 有出边但未配置选项（死路）`);
  }
  t.diagnostic(`节点图 ${Object.keys(SCENES).length} 个节点全部可达`);
});

/* ---------------------------------------------------------------- 角色/素材引用 */

test('角色表：CHARACTERS 与硬锚点 persons 的 id/姓名/职位一致', (t) => {
  assert.ok(CHARACTERS.length > 0, 'CHARACTERS 不能为空');
  const charIds = CHARACTERS.map((c) => c.id);
  assert.equal(new Set(charIds).size, charIds.length, 'CHARACTERS 的 id 必须唯一');

  const persons = new Map(env.anchors.persons.map((p) => [p.id, p]));
  for (const character of CHARACTERS) {
    const person = persons.get(character.id);
    assert.ok(person, `CHARACTERS 中的人物 ${character.id} 在 anchors.persons 中不存在`);
    assert.equal(character.name, person.name, `人物 ${character.id} 的姓名与硬锚点不一致`);
    assert.equal(character.title, person.title, `人物 ${character.id} 的职位与硬锚点不一致`);
    assert.ok(character.portrait, `人物 ${character.id} 缺少 portrait`);
    assert.ok(character.bio.trim(), `人物 ${character.id} 缺少 bio`);
  }

  const missing = env.anchors.persons.filter((p) => !charIds.includes(p.id)).map((p) => `${p.id}(${p.name})`);
  if (missing.length > 0) {
    t.diagnostic(`【数据观察】硬锚点人物未做前端角色卡：${missing.join('、')}（可能是有意为之）`);
  }
});

test('锚点/越界/剧本包引用的 nodeId 都与 SCENES 一致', (t) => {
  const nodeIds = new Set(Object.keys(SCENES));
  const problems = [];

  for (const [nodeId, facts] of Object.entries(env.anchors.nodeFacts)) {
    if (!nodeIds.has(nodeId)) problems.push(`anchors.nodeFacts.${nodeId} 不是剧本节点`);
    else if (facts.era !== SCENES[nodeId].era) problems.push(`anchors.nodeFacts.${nodeId}.era="${facts.era}" 与剧本 era="${SCENES[nodeId].era}" 不一致`);
    if (!Array.isArray(facts.immutable) || facts.immutable.length === 0) problems.push(`anchors.nodeFacts.${nodeId}.immutable 为空`);
    if (!Array.isArray(facts.forbidden) || facts.forbidden.length === 0) problems.push(`anchors.nodeFacts.${nodeId}.forbidden 为空`);
  }

  for (const nodeId of Object.keys(env.genpack.settings)) {
    if (!nodeIds.has(nodeId)) problems.push(`genpack.settings.${nodeId} 不是剧本节点`);
  }
  for (const rule of env.overreachRules) {
    if (rule.when && !nodeIds.has(rule.when.nodeId)) {
      problems.push(`overreach 规则 ${rule.id} 的 allowWhen.nodeId=${rule.when.nodeId} 不是剧本节点`);
    }
  }

  assert.deepEqual(problems, [], '锚点/越界/剧本包引用了不存在的节点');
  t.diagnostic(`锚点约束节点：${Object.keys(env.anchors.nodeFacts).join('、')}；剧本包场景：${Object.keys(env.genpack.settings).join('、')}`);
});

test('素材引用：角色头像与结局图存在；场景插槽缺失仅报告', (t) => {
  const missing = [];
  const exists = (rel) => fs.existsSync(path.join(PROJECT_ROOT, rel));

  for (const character of CHARACTERS) {
    if (!exists(character.portrait)) missing.push(`角色图 ${character.portrait}`);
  }
  for (const ending of ENDINGS) {
    const file = `assets/ending/ending_${String(ending.id).padStart(2, '0')}.jpg`;
    if (!exists(file)) missing.push(`结局图 ${file}`);
  }
  assert.deepEqual(missing, [], `静态素材缺失: ${missing.join('、')}`);

  // 场景图走「缺失即占位」插槽，不阻塞游戏；这里只报告，不硬失败
  const missingScenes = Object.entries(SCENES)
    .filter(([, node]) => node.art && !exists(node.art))
    .map(([nodeId, node]) => `${nodeId}→${node.art}`);
  if (missingScenes.length > 0) {
    t.diagnostic(`【数据观察】场景插槽图缺失（按设计走占位，不阻塞）：共 ${missingScenes.length} 处，如 ${missingScenes.slice(0, 3).join('、')}`);
  }
});
